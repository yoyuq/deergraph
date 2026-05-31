"""Build a DeerGraph snapshot for one run from persisted events.

Read-only, phase-1 scope. Sources only events already in ``RunEventStore``:
``llm.human.input``, ``llm.ai.response``, ``llm.tool.result`` (message
category) plus ``run.end`` / ``run.error``. No realtime, no ``task_*``.

Truncation handling (OpenClaw review decision 3): message events are pulled via
``list_messages_by_run`` cursor pagination — the store ``list_events`` contract
is NOT touched. ``run.end`` / ``run.error`` are few and fetched with a small
``list_events`` filter. A safety cap sets ``truncated=true`` rather than
silently dropping events.

Best-effort throughout: a builder failure must never break the gateway request
that calls it (the router also guards), and must never affect the main task.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from deerflow.runtime.events.store.base import RunEventStore
from deerflow.runtime.graph import event_mapper as em
from deerflow.runtime.graph.models import GraphEdge, GraphNode, GraphSnapshot
from deerflow.runtime.graph.sanitizer import Sanitizer

logger = logging.getLogger(__name__)

DEFAULT_MAX_EVENTS = 2000
DEFAULT_PAGE_SIZE = 500


async def build_graph_snapshot(
    store: RunEventStore,
    thread_id: str,
    run_id: str,
    *,
    max_events: int = DEFAULT_MAX_EVENTS,
    page_size: int = DEFAULT_PAGE_SIZE,
    sanitizer: Sanitizer | None = None,
) -> GraphSnapshot:
    """Assemble the MVP graph (User -> Lead -> Subagent -> Lead -> Final)."""
    sani = sanitizer or Sanitizer()

    messages, truncated = await _collect_messages(store, thread_id, run_id, max_events, page_size)
    end_events = await _collect_run_end(store, thread_id, run_id)

    builder = _SnapshotAssembler(thread_id, run_id, sani)
    builder.ingest_messages(messages)
    builder.finalize(end_events)

    return builder.snapshot(truncated=truncated)


async def _collect_messages(
    store: RunEventStore,
    thread_id: str,
    run_id: str,
    max_events: int,
    page_size: int,
) -> tuple[list[dict[str, Any]], bool]:
    """Cursor-paginate message events for a run; flag truncation at the cap."""
    collected: list[dict[str, Any]] = []
    cursor = 0
    truncated = False
    while True:
        page = await store.list_messages_by_run(thread_id, run_id, limit=page_size, after_seq=cursor)
        if not page:
            break
        collected.extend(page)
        cursor = page[-1]["seq"]
        if len(collected) >= max_events:
            truncated = True
            collected = collected[:max_events]
            break
        if len(page) < page_size:
            break
    return collected, truncated


async def _collect_run_end(store: RunEventStore, thread_id: str, run_id: str) -> list[dict[str, Any]]:
    """Fetch the (few) run terminal events. These never hit the 500 cap."""
    try:
        return await store.list_events(
            thread_id,
            run_id,
            event_types=["run.end", "run.error"],
            limit=10,
        )
    except Exception:  # noqa: BLE001 - best-effort, terminal events are optional
        logger.warning("failed to fetch run.end/run.error for %s/%s", thread_id, run_id, exc_info=True)
        return []


class _SnapshotAssembler:
    """Accumulate nodes/edges with id-based dedup; resolve the Final node last."""

    def __init__(self, thread_id: str, run_id: str, sanitizer: Sanitizer) -> None:
        self.thread_id = thread_id
        self.run_id = run_id
        self.sani = sanitizer
        self._nodes: dict[str, GraphNode] = {}
        self._edges: dict[str, GraphEdge] = {}
        self._subagent_ids: set[str] = set()
        self._last_final_candidate: dict[str, Any] | None = None
        self._orphan_results = 0
        self._saw_activity = False

    # -- ingestion ---------------------------------------------------------

    def ingest_messages(self, messages: list[dict[str, Any]]) -> None:
        for event in messages:
            try:
                self._ingest_one(event)
            except Exception:  # noqa: BLE001 - one bad event must not sink the graph
                logger.warning("graph mapper skipped a malformed event", exc_info=True)

    def _ingest_one(self, event: dict[str, Any]) -> None:
        event_type = event.get("event_type")
        if event_type == "llm.human.input":
            self._on_human_input(event)
        elif event_type == "llm.ai.response" and em.is_lead_event(event):
            self._on_lead_ai(event)
        elif event_type == "llm.tool.result":
            self._on_tool_result(event)

    def _on_human_input(self, event: dict[str, Any]) -> None:
        self._saw_activity = True
        self._ensure_lead()
        if em.USER_NODE_ID not in self._nodes:
            self._add_node(em.user_node_from_event(event, self.sani))
            self._add_edge(em.user_to_lead_edge())

    def _on_lead_ai(self, event: dict[str, Any]) -> None:
        self._saw_activity = True
        self._ensure_lead()
        task_calls = em.task_calls_from_ai_response(event)
        for call in task_calls:
            node_id = em.subagent_node_id(call.call_id)
            if node_id not in self._nodes:
                self._add_node(em.subagent_node(call, event, self.sani))
                self._add_edge(em.delegates_edge(call.call_id))
                self._subagent_ids.add(call.call_id)
        # A lead AIMessage with no tool calls is a Final-answer candidate.
        if not em.ai_has_tool_calls(event):
            self._last_final_candidate = event

    def _on_tool_result(self, event: dict[str, Any]) -> None:
        info = em.tool_result_info(event)
        call_id = info.tool_call_id
        if call_id is None or call_id not in self._subagent_ids:
            self._orphan_results += 1
            return
        self._add_edge(em.returns_edge(call_id))
        self._update_subagent_from_result(call_id, info)

    def _update_subagent_from_result(self, call_id: str, info: em.ToolResultInfo) -> None:
        node = self._nodes.get(em.subagent_node_id(call_id))
        if node is None:
            return
        node.status = "failed" if info.status == "error" else "completed"
        node.output_preview = self.sani.text(info.text)
        node.ended_at = info.created_at
        node.duration_ms = _duration_ms(node.started_at, info.created_at)

    # -- finalization ------------------------------------------------------

    def finalize(self, end_events: list[dict[str, Any]]) -> None:
        if not self._saw_activity:
            return
        run_error = _first(end_events, "run.error")
        run_end = _first(end_events, "run.end")

        if run_error is not None:
            self._ensure_lead()
            self._add_node(em.final_node_from_run_error(run_error, self.thread_id, self.run_id, self.sani))
            self._add_edge(em.lead_to_final_edge())
        elif self._last_final_candidate is not None:
            self._add_node(em.final_node_from_ai(self._last_final_candidate, self.sani))
            self._add_edge(em.lead_to_final_edge())
        elif run_end is not None:
            self._ensure_lead()
            self._add_node(em.final_node_from_run_end(run_end, self.thread_id, self.run_id, self.sani))
            self._add_edge(em.lead_to_final_edge())

    # -- helpers -----------------------------------------------------------

    def _ensure_lead(self) -> None:
        if em.LEAD_NODE_ID not in self._nodes:
            self._add_node(em.lead_agent_node(self.thread_id, self.run_id))

    def _add_node(self, node: GraphNode) -> None:
        self._nodes[node.id] = node

    def _add_edge(self, edge: GraphEdge) -> None:
        self._edges.setdefault(edge.id, edge)

    def snapshot(self, *, truncated: bool) -> GraphSnapshot:
        metadata: dict[str, Any] = {}
        if self._orphan_results:
            metadata["orphanResults"] = self._orphan_results
        return GraphSnapshot(
            thread_id=self.thread_id,
            run_id=self.run_id,
            nodes=list(self._nodes.values()),
            edges=list(self._edges.values()),
            truncated=truncated,
            metadata=metadata,
        )


def _first(events: list[dict[str, Any]], event_type: str) -> dict[str, Any] | None:
    for event in events:
        if event.get("event_type") == event_type:
            return event
    return None


def _duration_ms(start: str | None, end: str | None) -> int | None:
    if not start or not end:
        return None
    try:
        delta = datetime.fromisoformat(end) - datetime.fromisoformat(start)
        ms = int(delta.total_seconds() * 1000)
        return ms if ms >= 0 else None
    except (ValueError, TypeError):
        return None
