"""Graph data models for DeerGraph snapshots.

Field names mirror the TypeScript contract in the joint plan (camelCase on the
wire). Python uses snake_case internally and serializes via ``to_dict()``.
Unset optional fields are omitted to keep payloads compact.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal

NodeType = Literal["user", "lead_agent", "subagent", "tool", "final", "error"]
NodeStatus = Literal["pending", "running", "completed", "failed", "cancelled", "timeout"]
EdgeType = Literal["input", "delegates", "returns", "uses_tool", "produces"]
EdgeStatus = Literal["pending", "active", "completed", "failed"]


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


@dataclass
class GraphNode:
    id: str
    type: NodeType
    label: str
    status: NodeStatus
    thread_id: str
    run_id: str
    parent_id: str | None = None
    correlation_id: str | None = None
    started_at: str | None = None
    ended_at: str | None = None
    duration_ms: int | None = None
    summary: str | None = None
    input_preview: str | None = None
    output_preview: str | None = None
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "id": self.id,
            "type": self.type,
            "label": self.label,
            "status": self.status,
            "threadId": self.thread_id,
            "runId": self.run_id,
        }
        _put_optional(out, "parentId", self.parent_id)
        _put_optional(out, "correlationId", self.correlation_id)
        _put_optional(out, "startedAt", self.started_at)
        _put_optional(out, "endedAt", self.ended_at)
        _put_optional(out, "durationMs", self.duration_ms)
        _put_optional(out, "summary", self.summary)
        _put_optional(out, "inputPreview", self.input_preview)
        _put_optional(out, "outputPreview", self.output_preview)
        _put_optional(out, "error", self.error)
        if self.metadata:
            out["metadata"] = self.metadata
        return out


@dataclass
class GraphEdge:
    id: str
    source: str
    target: str
    type: EdgeType
    label: str | None = None
    status: EdgeStatus | None = None
    correlation_id: str | None = None
    created_at: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "id": self.id,
            "source": self.source,
            "target": self.target,
            "type": self.type,
        }
        _put_optional(out, "label", self.label)
        _put_optional(out, "status", self.status)
        _put_optional(out, "correlationId", self.correlation_id)
        _put_optional(out, "createdAt", self.created_at)
        if self.metadata:
            out["metadata"] = self.metadata
        return out


@dataclass
class GraphSnapshot:
    thread_id: str
    run_id: str
    nodes: list[GraphNode] = field(default_factory=list)
    edges: list[GraphEdge] = field(default_factory=list)
    version: int = 1
    truncated: bool = False
    updated_at: str = field(default_factory=_now_iso)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "threadId": self.thread_id,
            "runId": self.run_id,
            "version": self.version,
            "nodes": [n.to_dict() for n in self.nodes],
            "edges": [e.to_dict() for e in self.edges],
            "truncated": self.truncated,
            "updatedAt": self.updated_at,
        }
        if self.metadata:
            out["metadata"] = self.metadata
        return out


def _put_optional(target: dict[str, Any], key: str, value: Any) -> None:
    if value is not None:
        target[key] = value
