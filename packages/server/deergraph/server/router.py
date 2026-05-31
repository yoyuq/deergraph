"""DeerGraph visual runs router — read-only run graph snapshots (ADR-004).

:func:`create_router` is a factory: the host injects a :class:`RunEventSource`
and (optionally) a FastAPI auth dependency, with no global mutable state and no
host coupling (``app.gateway.*`` is gone).

Routes (relative to ``prefix``):
- ``GET /visual/runs/{run_id}/graph`` — the ADR-004 run-oriented path.
- ``GET /visual/runs/{thread_id}/{run_id}/graph`` — backward-compatible path
  retaining the ``thread_id`` segment used by the existing frontend.

A builder failure must never surface as a 500 — the assembler is best-effort
internally, and this router additionally degrades to an empty graph so the
visual page renders rather than erroring.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from fastapi import APIRouter, Depends

from deergraph.runtime import GraphSnapshot, build_graph_snapshot
from deergraph.runtime.ports import RunEventSource

logger = logging.getLogger(__name__)


def _noop_auth() -> None:
    """Default auth dependency: allow everything (open out of the box)."""
    return None


def create_router(
    *,
    event_source: RunEventSource,
    auth_dep: Callable[..., object] = _noop_auth,
    prefix: str = "",
) -> APIRouter:
    """Build a router serving DeerGraph snapshots from ``event_source``.

    The host controls auth granularity via ``auth_dep`` (default: noop) and the
    mount point via ``prefix`` (e.g. ``"/api"``).
    """
    router = APIRouter(prefix=prefix, tags=["visual"])

    def _snapshot(thread_id: str, run_id: str) -> dict:
        try:
            snapshot = build_graph_snapshot(event_source, thread_id, run_id)
        except Exception:  # noqa: BLE001 - best-effort: never 500 the visual page
            logger.warning("graph snapshot build failed for run %s", run_id, exc_info=True)
            snapshot = GraphSnapshot(thread_id=thread_id, run_id=run_id, nodes=[], edges=[])
        return snapshot.to_dict()

    @router.get("/visual/runs/{run_id}/graph", dependencies=[Depends(auth_dep)])
    def get_run_graph(run_id: str) -> dict:
        """Return the snapshot for one run; thread id is recovered from events."""
        return _snapshot(_thread_id_for(event_source, run_id), run_id)

    @router.get("/visual/runs/{thread_id}/{run_id}/graph", dependencies=[Depends(auth_dep)])
    def get_run_graph_with_thread(thread_id: str, run_id: str) -> dict:
        """Backward-compatible variant carrying the ``thread_id`` path segment."""
        return _snapshot(thread_id, run_id)

    return router


def _thread_id_for(event_source: RunEventSource, run_id: str) -> str:
    """Best-effort recovery of a run's thread id from its events ("" if none)."""
    try:
        events = event_source.list_events(run_id)
    except Exception:  # noqa: BLE001 - best-effort
        return ""
    for event in events:
        thread_id = event.get("thread_id")
        if isinstance(thread_id, str) and thread_id:
            return thread_id
    return ""
