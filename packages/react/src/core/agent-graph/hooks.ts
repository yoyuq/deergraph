import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useDeergraphRuntime } from "@/runtime-config";

import { fetchAgentGraph } from "./api";
import type { AgentGraphSnapshot } from "./types";

/** Stable react-query key for a run's graph snapshot. */
export function agentGraphQueryKey(
  runId: string | undefined,
): [string, string | undefined] {
  return ["agent-graph", runId];
}

export interface UseAgentGraphOptions {
  /**
   * Extra gate ANDed with the run-id presence check. Defaults to `true`. The
   * chat panel passes `enabled: open` so a closed panel does zero network work.
   */
  enabled?: boolean;
  /**
   * Near-realtime polling interval (ms). `false`/omitted means no polling — the
   * standalone single-fetch behavior. A host can set this while a run is in
   * progress and clear it once the run finishes.
   */
  refetchIntervalMs?: number | false;
}

/**
 * Load the stage-1 DeerGraph snapshot for a run.
 *
 * Read-only single fetch by default. Opt-in near-realtime via
 * `refetchIntervalMs` plus an extra `enabled` gate. The query stays disabled
 * until `runId` is known so the page can mount before params resolve.
 */
export function useAgentGraph(
  runId: string | undefined,
  options: UseAgentGraphOptions = {},
): UseQueryResult<AgentGraphSnapshot, Error> {
  const { enabled = true, refetchIntervalMs = false } = options;
  const runtime = useDeergraphRuntime();
  return useQuery({
    queryKey: agentGraphQueryKey(runId),
    queryFn: () => fetchAgentGraph(runId!, runtime),
    enabled: enabled && Boolean(runId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: refetchIntervalMs === false ? false : refetchIntervalMs,
  });
}
