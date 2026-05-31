// @vitest-environment jsdom
/**
 * Tests for `useResolvedRunId`, the chat-page run-id resolver. It prefers the
 * live active run id (handed down from the stream's onStart) and otherwise
 * recovers the latest run from the thread's run list. We mock `useThreadRuns`
 * (the real LangGraph runs.list query) so the resolution policy is pinned
 * without touching the network. No fabricated ids.
 */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/core/threads/hooks", () => ({
  useThreadRuns: vi.fn(),
}));

import { useResolvedRunId } from "@/core/agent-graph/use-resolved-run-id";
import { useThreadRuns } from "@/core/threads/hooks";

const mockedUseThreadRuns = vi.mocked(useThreadRuns);

function runsResult(data: unknown) {
  return { data } as unknown as ReturnType<typeof useThreadRuns>;
}

afterEach(() => {
  cleanup();
  mockedUseThreadRuns.mockReset();
});

describe("useResolvedRunId", () => {
  test("prefers the live active run id and skips the run-list query", () => {
    mockedUseThreadRuns.mockReturnValue(runsResult([]));

    const { result } = renderHook(() => useResolvedRunId("t1", "live-run"));

    expect(result.current).toBe("live-run");
    // The run-list query is disabled via its enabled gate when we already
    // have a live run id, so runs.list never executes.
    expect(mockedUseThreadRuns).toHaveBeenCalledWith("t1", { enabled: false });
  });

  test("falls back to the latest run from the run list", () => {
    mockedUseThreadRuns.mockReturnValue(
      runsResult([
        { run_id: "old", created_at: "2026-05-31T00:00:00+00:00" },
        { run_id: "new", created_at: "2026-05-31T02:00:00+00:00" },
      ]),
    );

    const { result } = renderHook(() => useResolvedRunId("t1", undefined));

    expect(result.current).toBe("new");
    expect(mockedUseThreadRuns).toHaveBeenCalledWith("t1", { enabled: true });
  });

  test("returns undefined when there is no active run and no history", () => {
    mockedUseThreadRuns.mockReturnValue(runsResult([]));

    const { result } = renderHook(() => useResolvedRunId("t1", undefined));

    expect(result.current).toBeUndefined();
  });
});
