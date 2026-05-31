"""DeerGraph runtime: build multi-agent run graphs from persisted run events.

Phase 1 scope is a read-only, non-mock snapshot derived from events supplied by
a :class:`RunEventSource`. No realtime, no persistence of ``task_*`` lifecycle
events.
"""

from __future__ import annotations

from deergraph.runtime.models import (
    GraphEdge,
    GraphNode,
    GraphSnapshot,
    RunEvent,
)
from deergraph.runtime.ports import RunEventSource
from deergraph.runtime.builder import build_graph_snapshot

__all__ = [
    "GraphEdge",
    "GraphNode",
    "GraphSnapshot",
    "RunEvent",
    "RunEventSource",
    "build_graph_snapshot",
]
