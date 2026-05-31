/**
 * Tests for the DeerGraph snapshot API client.
 *
 * The page's real data path goes through `fetchAgentGraph`, which calls the
 * stage-1 endpoint `GET /api/visual/runs/{threadId}/{runId}/graph` via the
 * CSRF/credentials-aware fetcher. These tests pin the URL construction
 * (including path-segment encoding), the GET contract, JSON parsing, and the
 * error behaviour so a refactor can't silently break the live request.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/core/api/fetcher", () => ({
  fetch: vi.fn(),
}));

vi.mock("@/core/config", () => ({
  getBackendBaseURL: () => "",
}));

import { fetchAgentGraph } from "@/core/agent-graph/api";
import type { AgentGraphSnapshot } from "@/core/agent-graph/types";
import { fetch as fetcher } from "@/core/api/fetcher";

const mockedFetch = vi.mocked(fetcher);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sampleSnapshot(): AgentGraphSnapshot {
  return {
    threadId: "t1",
    runId: "r1",
    version: 1,
    truncated: false,
    updatedAt: "2026-05-31T00:00:00+00:00",
    nodes: [
      {
        id: "user",
        type: "user",
        label: "User",
        status: "completed",
        threadId: "t1",
        runId: "r1",
      },
    ],
    edges: [],
  };
}

beforeEach(() => {
  mockedFetch.mockReset();
});

describe("fetchAgentGraph", () => {
  test("requests the stage-1 visual graph endpoint with GET", async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse(200, sampleSnapshot()));
    await fetchAgentGraph("t1", "r1");

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockedFetch.mock.calls[0]!;
    expect(url).toBe("/api/visual/runs/t1/r1/graph");
    expect(init?.method ?? "GET").toBe("GET");
  });

  test("encodes thread and run path segments", async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse(200, sampleSnapshot()));
    await fetchAgentGraph("thread/with space", "run#1");

    const [url] = mockedFetch.mock.calls[0]!;
    expect(url).toBe(
      "/api/visual/runs/thread%2Fwith%20space/run%231/graph",
    );
  });

  test("returns the parsed snapshot on 200", async () => {
    const snap = sampleSnapshot();
    mockedFetch.mockResolvedValueOnce(jsonResponse(200, snap));
    const result = await fetchAgentGraph("t1", "r1");
    expect(result).toEqual(snap);
  });

  test("throws with the status code on a non-2xx response", async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse(404, { detail: "nope" }));
    await expect(fetchAgentGraph("t1", "missing")).rejects.toThrow(/404/);
  });

  test("propagates a network-layer rejection", async () => {
    mockedFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(fetchAgentGraph("t1", "r1")).rejects.toBeInstanceOf(TypeError);
  });
});
