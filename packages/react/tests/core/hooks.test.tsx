// @vitest-environment jsdom
/**
 * Tests for the `useAgentGraph` react-query hook. The real data path is pinned:
 * the hook calls `fetchAgentGraph(runId)` (the live stage-1 API client) and is
 * disabled until a run id is present. We mock only the network client, not the
 * query wiring.
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
import { DeergraphProvider, type DeergraphRuntimeConfig } from "@/runtime-config";

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

function wrapper(runtime?: DeergraphRuntimeConfig) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function QueryWrapper({ children }: { children: ReactNode }) {
    const tree = runtime ? (
      <DeergraphProvider value={runtime}>{children}</DeergraphProvider>
    ) : (
      children
    );
    return <QueryClientProvider client={client}>{tree}</QueryClientProvider>;
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
  test("fetches the snapshot via the real API client when a run id is present", async () => {
    const snap = snapshot();
    mockedFetch.mockResolvedValueOnce(snap);

    const { result } = renderHook(() => useAgentGraph("r1"), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual(snap));
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch.mock.calls[0]?.[0]).toBe("r1");
  });

  test("passes DeergraphProvider runtime config to the API client", async () => {
    const snap = snapshot();
    const runtime = {
      fetcher: vi.fn<typeof fetch>(),
      baseUrl: "https://host.example",
    };
    mockedFetch.mockResolvedValueOnce(snap);

    const { result } = renderHook(() => useAgentGraph("r1"), {
      wrapper: wrapper(runtime),
    });

    await waitFor(() => expect(result.current.data).toEqual(snap));
    expect(mockedFetch).toHaveBeenCalledWith("r1", runtime);
  });

  test("is disabled (no fetch) until a run id is present", () => {
    renderHook(() => useAgentGraph(undefined), {
      wrapper: wrapper(),
    });
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  test("surfaces an error when the API client rejects", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("boom 500"));

    const { result } = renderHook(() => useAgentGraph("r1"), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  test("stays disabled when explicitly disabled, even with a run id", () => {
    renderHook(() => useAgentGraph("r1", { enabled: false }), {
      wrapper: wrapper(),
    });
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  test("polls when a refetch interval is provided", async () => {
    mockedFetch.mockResolvedValue(snapshot());

    renderHook(() => useAgentGraph("r1", { refetchIntervalMs: 40 }), {
      wrapper: wrapper(),
    });

    // Initial fetch plus at least one interval-driven refetch.
    await waitFor(
      () => expect(mockedFetch.mock.calls.length).toBeGreaterThanOrEqual(2),
      { timeout: 1000 },
    );
  });

  test("does not poll by default (single fetch)", async () => {
    mockedFetch.mockResolvedValue(snapshot());

    const { result } = renderHook(() => useAgentGraph("r1"), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Give a window in which a stray interval would have fired.
    await new Promise((r) => setTimeout(r, 120));
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });
});
