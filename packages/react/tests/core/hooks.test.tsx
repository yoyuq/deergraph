// @vitest-environment jsdom
/**
 * Tests for the `useAgentGraph` react-query hook. The real data path is pinned:
 * the hook calls `fetchAgentGraph(threadId, runId)` (the live stage-1 API
 * client) and is disabled until both ids are present. We mock only the network
 * client, not the query wiring.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/core/agent-graph/api", () => ({
  fetchAgentGraph: vi.fn(),
}));

import { fetchAgentGraph } from "@/core/agent-graph/api";
import { useAgentGraph } from "@/core/agent-graph/hooks";
import type { AgentGraphSnapshot } from "@/core/agent-graph/types";

const mockedFetch = vi.mocked(fetchAgentGraph);

function snapshot(): AgentGraphSnapshot {
  return {
    threadId: "t1",
    runId: "r1",
    version: 1,
    truncated: false,
    updatedAt: "2026-05-31T00:00:00+00:00",
    nodes: [],
    edges: [],
  };
}

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function QueryWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return QueryWrapper;
}

beforeEach(() => {
  mockedFetch.mockReset();
});

// Unmount rendered hooks between tests so polling QueryClients stop their
// intervals and don't leak fetch calls into the next test.
afterEach(cleanup);

describe("useAgentGraph", () => {
  test("fetches the snapshot via the real API client when ids are present", async () => {
    const snap = snapshot();
    mockedFetch.mockResolvedValueOnce(snap);

    const { result } = renderHook(() => useAgentGraph("t1", "r1"), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual(snap));
    expect(mockedFetch).toHaveBeenCalledWith("t1", "r1");
  });

  test("is disabled (no fetch) until both ids are present", () => {
    renderHook(() => useAgentGraph(undefined, undefined), {
      wrapper: wrapper(),
    });
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  test("surfaces an error when the API client rejects", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("boom 500"));

    const { result } = renderHook(() => useAgentGraph("t1", "r1"), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  test("stays disabled when explicitly disabled, even with both ids", () => {
    renderHook(() => useAgentGraph("t1", "r1", { enabled: false }), {
      wrapper: wrapper(),
    });
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  test("polls when a refetch interval is provided", async () => {
    mockedFetch.mockResolvedValue(snapshot());

    renderHook(
      () => useAgentGraph("t1", "r1", { refetchIntervalMs: 40 }),
      { wrapper: wrapper() },
    );

    // Initial fetch plus at least one interval-driven refetch.
    await waitFor(
      () => expect(mockedFetch.mock.calls.length).toBeGreaterThanOrEqual(2),
      { timeout: 1000 },
    );
  });

  test("does not poll by default (single fetch)", async () => {
    mockedFetch.mockResolvedValue(snapshot());

    const { result } = renderHook(() => useAgentGraph("t1", "r1"), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Give a window in which a stray interval would have fired.
    await new Promise((r) => setTimeout(r, 120));
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });
});
