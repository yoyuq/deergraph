"""Standalone DeerGraph snapshot demo.

Run with:

    python examples/demo_snapshot.py

No DeerFlow required. Uses ``MemoryRunEventSource`` to feed a realistic
sequence of persisted run events (the same shape ``RunEventStore`` produces)
into ``build_graph_snapshot``, then prints the resulting graph as JSON.

The simulated run shows the canonical MVP shape:

    User -> Lead Agent -> Subagent x 2 -> Lead Agent -> Final
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from deergraph.runtime.builder import build_graph_snapshot
from deergraph.testing import MemoryRunEventSource


THREAD_ID = "demo-thread-001"
RUN_ID = "demo-run-001"


def _iso(offset_seconds: float) -> str:
    base = datetime(2026, 6, 1, 9, 0, 0, tzinfo=timezone.utc)
    return (base + timedelta(seconds=offset_seconds)).isoformat()


def build_demo_event_source() -> MemoryRunEventSource:
    src = MemoryRunEventSource()

    # 1. User asks a multi-step question.
    src.put(
        thread_id=THREAD_ID,
        run_id=RUN_ID,
        event_type="llm.human.input",
        category="message",
        content="Compare DeerFlow and LangGraph, then summarise their differences.",
        created_at=_iso(0),
    )

    # 2. Lead agent delegates to two subagents in one AI response.
    src.put(
        thread_id=THREAD_ID,
        run_id=RUN_ID,
        event_type="llm.ai.response",
        category="message",
        content={
            "content": "Delegating research to two subagents.",
            "tool_calls": [
                {
                    "id": "call_research_deerflow",
                    "name": "task",
                    "args": {"description": "Research DeerFlow architecture and core abstractions."},
                },
                {
                    "id": "call_research_langgraph",
                    "name": "task",
                    "args": {"description": "Research LangGraph runtime model and state machine."},
                },
            ],
        },
        metadata={"caller": "lead_agent"},
        created_at=_iso(1),
    )

    # 3. Subagent A finishes first.
    src.put(
        thread_id=THREAD_ID,
        run_id=RUN_ID,
        event_type="llm.tool.result",
        category="message",
        content={
            "tool_call_id": "call_research_deerflow",
            "status": "success",
            "content": "DeerFlow uses a super-agent harness with task tool and SubagentExecutor.",
        },
        created_at=_iso(12),
    )

    # 4. Subagent B finishes a bit later.
    src.put(
        thread_id=THREAD_ID,
        run_id=RUN_ID,
        event_type="llm.tool.result",
        category="message",
        content={
            "tool_call_id": "call_research_langgraph",
            "status": "success",
            "content": "LangGraph models execution as a stateful graph with checkpointers.",
        },
        created_at=_iso(18),
    )

    # 5. Lead agent produces the final answer (AI response with no tool calls).
    src.put(
        thread_id=THREAD_ID,
        run_id=RUN_ID,
        event_type="llm.ai.response",
        category="message",
        content={
            "content": (
                "DeerFlow is a super-agent harness orchestrating sub-agents via the "
                "task tool, while LangGraph is a state-machine runtime; DeerFlow is "
                "task-decomposition oriented and LangGraph is graph-execution oriented."
            ),
            "tool_calls": [],
        },
        metadata={"caller": "lead_agent"},
        created_at=_iso(22),
    )

    # 6. Run terminator.
    src.put(
        thread_id=THREAD_ID,
        run_id=RUN_ID,
        event_type="run.end",
        category="terminal",
        content="run completed",
        created_at=_iso(23),
    )

    return src


def main() -> None:
    src = build_demo_event_source()
    snapshot = build_graph_snapshot(src, THREAD_ID, RUN_ID)
    # ``to_dict`` emits the exact camelCase wire format the FastAPI router
    # returns (optional fields omitted), so this output matches what the React
    # client consumes from ``/api/visual/runs/{run_id}/graph``.
    print(json.dumps(snapshot.to_dict(), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
