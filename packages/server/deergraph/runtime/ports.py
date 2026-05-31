"""Injection contracts for the DeerGraph runtime (ADR-004 contract 1).

``RunEventSource`` is a structural :class:`typing.Protocol`: the host supplies
any object exposing ``list_events(run_id)``. deergraph never imports the host's
event store type, so swapping the backing store (memory / Redis / DB) needs no
change here.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol, runtime_checkable

from deergraph.runtime.models import RunEvent


@runtime_checkable
class RunEventSource(Protocol):
    """Read-only source of persisted run events for one run.

    Returns the events as plain dicts (see :data:`RunEvent`) in any order; the
    builder sorts by ``seq`` itself.
    """

    def list_events(self, run_id: str) -> Sequence[RunEvent]: ...
