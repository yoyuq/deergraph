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

/**
 * Load the stage-1 DeerGraph snapshot for a run.
 *
 * Read-only and non-realtime by design (stage 3 scope): a single fetch via
 * `fetchAgentGraph`, no SSE/polling. The query stays disabled until both
 * `threadId` and `runId` are known so the page can mount before params resolve.
 */
export function useAgentGraph(
  threadId: string | undefined,
  runId: string | undefined,
): UseQueryResult<AgentGraphSnapshot, Error> {
  return useQuery({
    queryKey: agentGraphQueryKey(threadId, runId),
    queryFn: () => fetchAgentGraph(threadId!, runId!),
    enabled: Boolean(threadId) && Boolean(runId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
