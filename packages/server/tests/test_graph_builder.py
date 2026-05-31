"""Integration-ish unit tests for the DeerGraph builder (phase 1).

Builds GraphSnapshots from a real MemoryRunEventStore populated with events
shaped like RunJournal output. No mocks of the product path — only the store
is the in-memory backend used in production for ``run_events.backend=memory``.
"""

from __future__ import annotations

import pytest

from deerflow.runtime.events.store.memory import MemoryRunEventStore
from deerflow.runtime.graph import event_mapper as em
from deerflow.runtime.graph.builder import build_graph_snapshot

THREAD = "t1"
RUN = "r1"


async def _put(store, event_type, content, *, caller="lead_agent", category="message"):
    meta = {} if caller is None else {"caller": caller}
    return await store.put(
        thread_id=THREAD,
        run_id=RUN,
        event_type=event_type,
        category=category,
        content=content,
        metadata=meta,
    )


def _human(text):
    return {"type": "human", "content": text}


def _ai_with_task(call_id, description):
    return {
        "type": "ai",
        "content": "delegating to a subagent",
        "tool_calls": [{"name": "task", "id": call_id, "args": {"description": description}, "type": "tool_call"}],
    }


def _ai_final(text):
    return {"type": "ai", "content": text, "tool_calls": []}


def _tool_result(call_id, text, status="success"):
    return {"type": "tool", "tool_call_id": call_id, "content": text, "status": status}


def _ids(items):
    return {i.id for i in items}


def _node(snap, node_id):
    return next(n for n in snap.nodes if n.id == node_id)


def _has_edge(snap, source, target, type_):
    return any(e.source == source and e.target == target and e.type == type_ for e in snap.edges)


# --------------------------------------------------------------------------
# Full MVP chain
# --------------------------------------------------------------------------


class TestFullChain:
    @pytest.mark.anyio
    async def test_user_lead_subagent_lead_final(self):
        store = MemoryRunEventStore()
        await _put(store, "llm.human.input", _human("Research quantum computing"))
        await _put(store, "llm.ai.response", _ai_with_task("call_1", "research quantum basics"))
        await _put(store, "llm.tool.result", _tool_result("call_1", "found 3 papers"))
        await _put(store, "llm.ai.response", _ai_final("Quantum computing uses qubits."))
        await _put(store, "run.end", {"output": "done"}, caller=None, category="outputs")

        snap = await build_graph_snapshot(store, THREAD, RUN)

        ids = _ids(snap.nodes)
        assert em.USER_NODE_ID in ids
        assert em.LEAD_NODE_ID in ids
        assert em.subagent_node_id("call_1") in ids
        assert em.FINAL_NODE_ID in ids

        assert _has_edge(snap, em.USER_NODE_ID, em.LEAD_NODE_ID, "input")
        assert _has_edge(snap, em.LEAD_NODE_ID, em.subagent_node_id("call_1"), "delegates")
        assert _has_edge(snap, em.subagent_node_id("call_1"), em.LEAD_NODE_ID, "returns")
        assert _has_edge(snap, em.LEAD_NODE_ID, em.FINAL_NODE_ID, "produces")

        # Subagent status inferred completed from a successful tool result.
        assert _node(snap, em.subagent_node_id("call_1")).status == "completed"
        assert _node(snap, em.FINAL_NODE_ID).status == "completed"
        assert snap.truncated is False
        assert snap.thread_id == THREAD
        assert snap.run_id == RUN

    @pytest.mark.anyio
    async def test_multiple_subagents(self):
        store = MemoryRunEventStore()
        await _put(store, "llm.human.input", _human("Compare A and B"))
        await _put(store, "llm.ai.response", _ai_with_task("call_1", "research A"))
        await _put(store, "llm.ai.response", _ai_with_task("call_2", "research B"))
        await _put(store, "llm.tool.result", _tool_result("call_1", "A facts"))
        await _put(store, "llm.tool.result", _tool_result("call_2", "B facts"))
        await _put(store, "llm.ai.response", _ai_final("A and B compared."))

        snap = await build_graph_snapshot(store, THREAD, RUN)
        ids = _ids(snap.nodes)
        assert em.subagent_node_id("call_1") in ids
        assert em.subagent_node_id("call_2") in ids
        assert _has_edge(snap, em.LEAD_NODE_ID, em.subagent_node_id("call_2"), "delegates")
        assert _has_edge(snap, em.subagent_node_id("call_2"), em.LEAD_NODE_ID, "returns")


# --------------------------------------------------------------------------
# Failure / error handling
# --------------------------------------------------------------------------


class TestFailureModes:
    @pytest.mark.anyio
    async def test_run_error_produces_error_final(self):
        store = MemoryRunEventStore()
        await _put(store, "llm.human.input", _human("Do the thing"))
        await _put(store, "llm.ai.response", _ai_with_task("call_1", "do it"))
        await _put(store, "run.error", "RuntimeError: kaboom", caller=None, category="error")

        snap = await build_graph_snapshot(store, THREAD, RUN)
        final = _node(snap, em.FINAL_NODE_ID)
        assert final.type == "error"
        assert final.status == "failed"
        assert "kaboom" in final.error

    @pytest.mark.anyio
    async def test_failed_tool_result_marks_subagent_failed(self):
        store = MemoryRunEventStore()
        await _put(store, "llm.human.input", _human("q"))
        await _put(store, "llm.ai.response", _ai_with_task("call_1", "do it"))
        await _put(store, "llm.tool.result", _tool_result("call_1", "error occurred", status="error"))

        snap = await build_graph_snapshot(store, THREAD, RUN)
        assert _node(snap, em.subagent_node_id("call_1")).status == "failed"

    @pytest.mark.anyio
    async def test_orphan_tool_result_does_not_crash(self):
        store = MemoryRunEventStore()
        await _put(store, "llm.human.input", _human("q"))
        await _put(store, "llm.tool.result", _tool_result("call_unknown", "orphan result"))

        snap = await build_graph_snapshot(store, THREAD, RUN)
        # No subagent node for the orphan; no returns edge; still returns cleanly.
        assert em.subagent_node_id("call_unknown") not in _ids(snap.nodes)
        assert not any(e.type == "returns" for e in snap.edges)


# --------------------------------------------------------------------------
# Edge cases
# --------------------------------------------------------------------------


class TestEdgeCases:
    @pytest.mark.anyio
    async def test_empty_run_returns_empty_snapshot(self):
        store = MemoryRunEventStore()
        snap = await build_graph_snapshot(store, THREAD, RUN)
        assert snap.nodes == []
        assert snap.edges == []
        assert snap.truncated is False

    @pytest.mark.anyio
    async def test_repeated_build_is_stable(self):
        store = MemoryRunEventStore()
        await _put(store, "llm.human.input", _human("q"))
        await _put(store, "llm.ai.response", _ai_with_task("call_1", "do it"))
        await _put(store, "llm.tool.result", _tool_result("call_1", "ok"))
        await _put(store, "llm.ai.response", _ai_final("answer"))

        snap1 = await build_graph_snapshot(store, THREAD, RUN)
        snap2 = await build_graph_snapshot(store, THREAD, RUN)
        assert snap1.to_dict()["nodes"] == snap2.to_dict()["nodes"]
        assert snap1.to_dict()["edges"] == snap2.to_dict()["edges"]

    @pytest.mark.anyio
    async def test_truncation_flag_set_when_cap_hit(self):
        store = MemoryRunEventStore()
        await _put(store, "llm.human.input", _human("q"))
        await _put(store, "llm.ai.response", _ai_with_task("call_1", "a"))
        await _put(store, "llm.tool.result", _tool_result("call_1", "ok"))
        await _put(store, "llm.ai.response", _ai_final("answer"))

        snap = await build_graph_snapshot(store, THREAD, RUN, max_events=2)
        assert snap.truncated is True

    @pytest.mark.anyio
    async def test_subagent_internal_events_are_ignored(self):
        store = MemoryRunEventStore()
        await _put(store, "llm.human.input", _human("q"))
        await _put(store, "llm.ai.response", _ai_with_task("call_1", "research"))
        # A subagent-internal AIMessage with its own (non-task) tool call must
        # not create lead-level subagent nodes.
        await _put(
            store,
            "llm.ai.response",
            {"type": "ai", "tool_calls": [{"name": "read_file", "id": "inner_1", "args": {}}]},
            caller="subagent:research",
        )
        await _put(store, "llm.tool.result", _tool_result("call_1", "done"))
        await _put(store, "llm.ai.response", _ai_final("answer"))

        snap = await build_graph_snapshot(store, THREAD, RUN)
        subagent_nodes = [n for n in snap.nodes if n.type == "subagent"]
        assert len(subagent_nodes) == 1
        assert subagent_nodes[0].id == em.subagent_node_id("call_1")
