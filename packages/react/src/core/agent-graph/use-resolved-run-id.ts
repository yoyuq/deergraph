import { useThreadRuns } from "@/core/threads/hooks";

import { pickLatestRunId } from "./run-id";

/**
 * Resolve the run id the chat-page Agent Graph should display.
 *
 * Policy (see Stage 4 design):
 *  1. Prefer `activeRunId` — the live run id lifted from the stream's `onStart`.
 *  2. Otherwise recover the most recent run from the thread's run list
 *     (`useThreadRuns` → real `runs.list`).
 *  3. Otherwise `undefined` — the panel shows a hint, never a fabricated id.
 *
 * When an active run id is already known we disable the run-list query via its
 * `enabled` gate so `runs.list` never executes a needless request.
 */
export function useResolvedRunId(
  threadId: string | undefined,
  activeRunId: string | undefined,
): string | undefined {
  const runs = useThreadRuns(threadId, { enabled: !activeRunId });
  if (activeRunId) {
    return activeRunId;
  }
  return pickLatestRunId(runs.data);
}
