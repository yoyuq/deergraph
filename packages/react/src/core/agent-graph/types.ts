/**
 * TypeScript contract for DeerGraph snapshots.
 *
 * Mirrors the backend wire format produced by
 * `deerflow.runtime.graph.models.*.to_dict()` (camelCase, optional fields
 * omitted). Keep these unions in sync with `models.py` —
 * `NodeType`/`NodeStatus`/`EdgeType`/`EdgeStatus`.
 */

export type AgentGraphNodeType =
  | "user"
  | "lead_agent"
  | "subagent"
  | "tool"
  | "final"
  | "error";

export type AgentGraphNodeStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

export type AgentGraphEdgeType =
  | "input"
  | "delegates"
  | "returns"
  | "uses_tool"
  | "produces";

export type AgentGraphEdgeStatus =
  | "pending"
  | "active"
  | "completed"
  | "failed";

export interface AgentGraphNode {
  id: string;
  type: AgentGraphNodeType;
  label: string;
  status: AgentGraphNodeStatus;
  threadId: string;
  runId: string;
  parentId?: string;
  correlationId?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  summary?: string;
  inputPreview?: string;
  outputPreview?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentGraphEdge {
  id: string;
  source: string;
  target: string;
  type: AgentGraphEdgeType;
  label?: string;
  status?: AgentGraphEdgeStatus;
  correlationId?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentGraphSnapshot {
  threadId: string;
  runId: string;
  version: number;
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
  truncated: boolean;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}
