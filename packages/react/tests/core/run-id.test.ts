/**
 * Tests for `pickLatestRunId`, the pure helper that resolves a thread's most
 * recent run id from the LangGraph `runs.list` payload. The chat-page Agent
 * Graph panel uses this to recover a run id on a fresh page load (no live
 * stream), so the contract — newest `created_at` wins, robust to ordering and
 * empties — is pinned here. No mocking, no fabricated ids.
 */
import { describe, expect, test } from "vitest";

import {
  pickLatestRunId,
  selectActiveRunId,
  type RunLike,
} from "@/core/agent-graph/run-id";

function run(run_id: string, created_at: string): RunLike {
  return { run_id, created_at };
}

describe("pickLatestRunId", () => {
  test("returns undefined for an empty list", () => {
    expect(pickLatestRunId([])).toBeUndefined();
  });

  test("returns undefined for nullish input", () => {
    expect(pickLatestRunId(undefined)).toBeUndefined();
    expect(pickLatestRunId(null)).toBeUndefined();
  });

  test("returns the only run's id", () => {
    expect(pickLatestRunId([run("r1", "2026-05-31T00:00:00+00:00")])).toBe("r1");
  });

  test("picks the newest by created_at regardless of array order", () => {
    const runs = [
      run("old", "2026-05-31T00:00:00+00:00"),
      run("newest", "2026-05-31T03:00:00+00:00"),
      run("middle", "2026-05-31T01:00:00+00:00"),
    ];
    expect(pickLatestRunId(runs)).toBe("newest");
  });

  test("does not mutate the input array", () => {
    const runs = [
      run("a", "2026-05-31T00:00:00+00:00"),
      run("b", "2026-05-31T02:00:00+00:00"),
    ];
    const snapshot = [...runs];
    pickLatestRunId(runs);
    expect(runs).toEqual(snapshot);
  });

  test("ignores entries without a usable created_at", () => {
    const runs = [
      run("valid", "2026-05-31T00:00:00+00:00"),
      { run_id: "no-date", created_at: "" } as RunLike,
    ];
    expect(pickLatestRunId(runs)).toBe("valid");
  });

  test("returns undefined when no entry has a usable created_at", () => {
    const runs = [{ run_id: "x", created_at: "" } as RunLike];
    expect(pickLatestRunId(runs)).toBeUndefined();
  });
});

describe("selectActiveRunId", () => {
  test("returns the run id when the active run belongs to the thread", () => {
    expect(
      selectActiveRunId({ threadId: "t1", runId: "r1" }, "t1"),
    ).toBe("r1");
  });

  test("does not leak a previous thread's run id into a new thread", () => {
    // Active run captured on thread t1, but the page is now on thread t2.
    expect(
      selectActiveRunId({ threadId: "t1", runId: "r1" }, "t2"),
    ).toBeUndefined();
  });

  test("returns undefined when there is no active run", () => {
    expect(selectActiveRunId(undefined, "t1")).toBeUndefined();
  });

  test("returns undefined when the thread id is not yet known", () => {
    expect(
      selectActiveRunId({ threadId: "t1", runId: "r1" }, undefined),
    ).toBeUndefined();
  });
});
