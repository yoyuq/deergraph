"""DeerGraph server package: runtime graph builder + FastAPI router.

A read-only visual runtime graph for LangGraph agents. The package holds no
business concepts (thread / session / user), no transport (HTTP client / auth),
and no storage backend — those are injected by the host via the contracts in
:mod:`deergraph.runtime.ports` and :func:`deergraph.server.create_router`.
"""

from __future__ import annotations

__all__: list[str] = []
