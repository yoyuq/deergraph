"""DeerGraph visual runs endpoint — read-only run graph snapshots.

Exposes ``GET /api/visual/runs/{thread_id}/{run_id}/graph`` returning a
:class:`GraphSnapshot` assembled from persisted ``RunEventStore`` events. Phase
1 is read-only and non-realtime: no SSE, no polling, no ``task_*`` persistence.

A builder failure must never surface as a 500 — the snapshot assembler is
best-effort internally, and this router additionally degrades to an empty graph
so the visual page renders rather than erroring.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request

from app.gateway.authz import require_permission
from app.gateway.deps import get_run_event_store
from deerflow.runtime.graph import GraphSnapshot, build_graph_snapshot

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/visual", tags=["visual"])


@router.get("/runs/{thread_id}/{run_id}/graph")
@require_permission("runs", "read", owner_check=True)
async def get_run_graph(thread_id: str, run_id: str, request: Request) -> dict:
    """Return the DeerGraph snapshot for one run as a camelCase dict."""
    store = get_run_event_store(request)
    try:
        snapshot = await build_graph_snapshot(store, thread_id, run_id)
    except Exception:  # noqa: BLE001 - best-effort: never 500 the visual page
        logger.warning("graph snapshot build failed for %s/%s", thread_id, run_id, exc_info=True)
        snapshot = GraphSnapshot(thread_id=thread_id, run_id=run_id, nodes=[], edges=[])
    return snapshot.to_dict()
