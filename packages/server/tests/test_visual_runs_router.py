"""API tests for the DeerGraph visual runs router (phase 1).

Exercises GET /api/visual/runs/{thread_id}/{run_id}/graph end-to-end through a
TestClient with stub auth. The event store is a real ``MemoryRunEventStore``
populated with RunJournal-shaped events — no mock of the product path.
"""

from __future__ import annotations

import asyncio

from _router_auth_helpers import make_authed_test_app
from fastapi.testclient import TestClient

from app.gateway.routers import visual_runs
from deerflow.runtime.events.store.memory import MemoryRunEventStore

THREAD = "t1"
RUN = "r1"
GRAPH_PATH = f"/api/visual/runs/{THREAD}/{RUN}/graph"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _put(store, event_type, content, *, caller="lead_agent", category="message"):
    meta = {} if caller is None else {"caller": caller}
    await store.put(
        thread_id=THREAD,
        run_id=RUN,
        event_type=event_type,
        category=category,
        content=content,
        metadata=meta,
    )


def _populated_store() -> MemoryRunEventStore:
    store = MemoryRunEventStore()

    async def _seed():
        await _put(store, "llm.human.input", {"type": "human", "content": "Research quantum computing"})
        await _put(
            store,
            "llm.ai.response",
            {
                "type": "ai",
                "content": "delegating",
                "tool_calls": [{"name": "task", "id": "call_1", "args": {"description": "research basics"}}],
            },
        )
        await _put(
            store,
            "llm.tool.result",
            {"type": "tool", "tool_call_id": "call_1", "content": "found 3 papers", "status": "success"},
        )
        await _put(store, "llm.ai.response", {"type": "ai", "content": "Quantum uses qubits.", "tool_calls": []})

    asyncio.run(_seed())
    return store


def _make_app(store: MemoryRunEventStore, *, owner_check_passes: bool = True):
    app = make_authed_test_app(owner_check_passes=owner_check_passes)
    app.include_router(visual_runs.router)
    app.state.run_event_store = store
    return app


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_graph_endpoint_returns_snapshot():
    app = _make_app(_populated_store())
    with TestClient(app) as client:
        response = client.get(GRAPH_PATH)

    assert response.status_code == 200
    body = response.json()
    # camelCase wire format
    assert body["threadId"] == THREAD
    assert body["runId"] == RUN
    node_ids = {n["id"] for n in body["nodes"]}
    assert "user" in node_ids
    assert "lead_agent" in node_ids
    assert "subagent:call_1" in node_ids
    assert "final" in node_ids
    assert body["truncated"] is False
    assert len(body["edges"]) >= 4


def test_empty_run_returns_empty_graph_not_500():
    app = _make_app(MemoryRunEventStore())
    with TestClient(app) as client:
        response = client.get(GRAPH_PATH)

    assert response.status_code == 200
    body = response.json()
    assert body["nodes"] == []
    assert body["edges"] == []
    assert body["truncated"] is False


def test_owner_check_denied_returns_404():
    app = _make_app(_populated_store(), owner_check_passes=False)
    with TestClient(app) as client:
        response = client.get(GRAPH_PATH)

    assert response.status_code == 404
