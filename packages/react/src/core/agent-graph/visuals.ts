import type {
  AgentGraphNodeStatus,
  AgentGraphNodeType,
} from "./types";

/** Semantic colour tone for a node/edge status, mapped to classes in the UI. */
export type StatusTone = "neutral" | "running" | "success" | "warning" | "danger";

const ROLE_LABELS: Record<AgentGraphNodeType, string> = {
  user: "User",
  lead_agent: "Lead Agent",
  subagent: "Subagent",
  tool: "Tool",
  final: "Final Answer",
  error: "Error",
};

const STATUS_TONES: Record<AgentGraphNodeStatus, StatusTone> = {
  pending: "neutral",
  running: "running",
  completed: "success",
  failed: "danger",
  cancelled: "warning",
  timeout: "warning",
};

/** Human-friendly label for a node role. */
export function nodeRoleLabel(type: AgentGraphNodeType): string {
  return ROLE_LABELS[type] ?? type;
}

/** Semantic tone for status-based colouring. */
export function statusTone(status: AgentGraphNodeStatus): StatusTone {
  return STATUS_TONES[status] ?? "neutral";
}

/** Capitalize a status token for display ("running" -> "Running"). */
export function statusLabel(status: AgentGraphNodeStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Format a duration in milliseconds for compact display.
 * - `undefined` -> `null` (caller hides the field)
 * - `< 1000ms` -> `"500ms"`
 * - `< 60s`    -> `"1.5s"`
 * - otherwise  -> `"1m 5s"`
 */
export function formatDuration(ms: number | undefined): string | null {
  if (ms === undefined || ms === null || Number.isNaN(ms)) {
    return null;
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${(Math.round(totalSeconds * 10) / 10).toString()}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds - minutes * 60);
  return `${minutes}m ${seconds}s`;
}
