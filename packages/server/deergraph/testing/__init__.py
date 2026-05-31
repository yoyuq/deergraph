"""Test-only helpers for DeerGraph (ADR-004).

``MemoryRunEventSource`` is an in-memory :class:`RunEventSource` for unit tests
and examples. It is intentionally minimal — production hosts adapt their own
event store to the ``RunEventSource`` protocol instead of using this.
"""

from __future__ import annotations

from typing import Any

from deergraph.runtime.models import RunEvent

__all__ = ["MemoryRunEventSource"]


class MemoryRunEventSource:
    """Append-only, in-memory run event source keyed by ``run_id``."""

    def __init__(self) -> None:
        self._events: list[dict[str, Any]] = []
        self._seq = 0

    def put(
        self,
        *,
        thread_id: str,
        run_id: str,
        event_type: str,
        category: str,
        content: Any,
        metadata: dict[str, Any] | None = None,
        created_at: str | None = None,
    ) -> RunEvent:
        """Append an event, assigning a monotonically increasing ``seq``."""
        self._seq += 1
        record: dict[str, Any] = {
            "thread_id": thread_id,
            "run_id": run_id,
            "event_type": event_type,
            "category": category,
            "content": content,
            "metadata": metadata or {},
            "seq": self._seq,
            "created_at": created_at,
        }
        self._events.append(record)
        return record

    def list_events(self, run_id: str) -> list[RunEvent]:
        return [e for e in self._events if e["run_id"] == run_id]
