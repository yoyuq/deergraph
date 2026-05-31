import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { fetchAgentGraph } from "./api";
import type { AgentGraphSnapshot } from "./types";

/** Stable react-query key for a run's graph snapshot. */
export function agentGraphQueryKey(
  threadId: string | undefined,
  runId: string | undefined,
): [string, string | undefined, string | undefined] {
  return ["agent-graph", threadId, runId];
}

export interface UseAgentGraphOptions {
  /**
   * Extra gate ANDed with the id presence check. Defaults to `true`. The chat
   * panel passes `enabled: open` so a closed panel does zero network work.
   */
  enabled?: boolean;
  /**
   * Near-realtime polling interval (ms). `false`/omitted means no polling —
   * the standalone Stage-3 page keeps its single-fetch behavior. The chat
   * panel sets this while a run is in progress and clears it once it finishes.
   */
  refetchIntervalMs?: number | false;
}

/**
 * Load the stage-1 DeerGraph snapshot for a run.
 *
 * Read-only single fetch by default (stage 3 behavior, preserved for 2-arg
 * callers). Stage 4 adds opt-in near-realtime via `refetchIntervalMs` and an
 * extra `enabled` gate. The query stays disabled until both `threadId` and
 * `runId` are known so the page can mount before params resolve.
 */
export function useAgentGraph(
  threadId: string | undefined,
  runId: string | undefined,
  options: UseAgentGraphOptions = {},
): UseQueryResult<AgentGraphSnapshot, Error> {
  const { enabled = true, refetchIntervalMs = false } = options;
  return useQuery({
    queryKey: agentGraphQueryKey(threadId, runId),
    queryFn: () => fetchAgentGraph(threadId!, runId!),
    enabled: enabled && Boolean(threadId) && Boolean(runId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: refetchIntervalMs === false ? false : refetchIntervalMs,
  });
}
