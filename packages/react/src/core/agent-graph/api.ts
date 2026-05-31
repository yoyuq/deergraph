import { fetch as fetchWithAuth } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";

import type { AgentGraphSnapshot } from "./types";

/**
 * Fetch the stage-1 DeerGraph snapshot for one run.
 *
 * Hits the read-only endpoint
 * `GET /api/visual/runs/{threadId}/{runId}/graph` through the shared
 * CSRF/credentials-aware fetcher. This is the page's only data path — the
 * standalone graph page never fabricates snapshots client-side.
 */
export async function fetchAgentGraph(
  threadId: string,
  runId: string,
): Promise<AgentGraphSnapshot> {
  const url = `${getBackendBaseURL()}/api/visual/runs/${encodeURIComponent(
    threadId,
  )}/${encodeURIComponent(runId)}/graph`;

  const res = await fetchWithAuth(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Failed to load agent graph: ${res.status}`);
  }
  return (await res.json()) as AgentGraphSnapshot;
}
