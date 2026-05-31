import { getDeergraphRuntime, type DeergraphRuntimeConfig } from "@/runtime-config";

import type { AgentGraphSnapshot } from "./types";

/**
 * Fetch the stage-1 DeerGraph snapshot for one run.
 *
 * Hits the read-only endpoint `GET {baseUrl}/api/visual/runs/{runId}/graph`
 * using the injected runtime `fetcher` + `baseUrl` (see {@link getDeergraphRuntime}).
 * This is the page's only data path — the graph view never fabricates
 * snapshots client-side.
 */
export async function fetchAgentGraph(
  runId: string,
  runtime: DeergraphRuntimeConfig = getDeergraphRuntime(),
): Promise<AgentGraphSnapshot> {
  const { fetcher, baseUrl } = { ...getDeergraphRuntime(), ...runtime };
  const url = `${baseUrl}/api/visual/runs/${encodeURIComponent(runId)}/graph`;

  const res = await fetcher(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Failed to load agent graph: ${res.status}`);
  }
  return (await res.json()) as AgentGraphSnapshot;
}
