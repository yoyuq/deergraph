"""API tests for the DeerGraph visual runs router (phase 1).

Exercises the router built by :func:`create_router` end-to-end through a
TestClient. The event source is a real :class:`MemoryRunEventSource` populated
with RunJournal-shaped events — no mock of the product path. Auth is injected
via the ``auth_dep`` factory parameter (ADR-004 contract 2).
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from deergraph.server import create_router
from deergraph.testing import MemoryRunEventSource

THREAD = "t1"
RUN = "r1"
GRAPH_PATH = f"/api/visual/runs/{THREAD}/{RUN}/graph"
RUN_ONLY_PATH = f"/api/visual/runs/{RUN}/graph"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _put(store, event_type, content, *, caller="lead_agent", category="message"):
    meta = {} if caller is None else {"caller": caller}
    store.put(
        thread_id=THREAD,
        run_id=RUN,
        event_type=event_type,
        category=category,
        content=content,
        metadata=meta,
    )


def _populated_store() -> MemoryRunEventSource:
    store = MemoryRunEventSource()
    _put(store, "llm.human.input", {"type": "human", "content": "Research quantum computing"})
    _put(
        store,
        "llm.ai.response",
        {
            "type": "ai",
            "content": "delegating",
            "tool_calls": [{"name": "task", "id": "call_1", "args": {"description": "research basics"}}],
        },
    )
    _put(
        store,
        "llm.tool.result",
        {"type": "tool", "tool_call_id": "call_1", "content": "found 3 papers", "status": "success"},
    )
    _put(store, "llm.ai.response", {"type": "ai", "content": "Quantum uses qubits.", "tool_calls": []})
    return store


def _make_app(store: MemoryRunEventSource, *, owner_check_passes: bool = True) -> FastAPI:
    def auth_dep() -> None:
        if not owner_check_passes:
            # Mirror the host's owner-check denial as a 404 (don't reveal existence).
            raise HTTPException(status_code=404)

    app = FastAPI()
    app.include_router(create_router(event_source=store, auth_dep=auth_dep, prefix="/api"))
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


def test_run_only_endpoint_recovers_thread_id_from_events():
    app = _make_app(_populated_store())
    with TestClient(app) as client:
        response = client.get(RUN_ONLY_PATH)

    assert response.status_code == 200
    body = response.json()
    assert body["runId"] == RUN
    # thread id is recovered from the events even though the path omits it.
    assert body["threadId"] == THREAD


def test_empty_run_returns_empty_graph_not_500():
    app = _make_app(MemoryRunEventSource())
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
