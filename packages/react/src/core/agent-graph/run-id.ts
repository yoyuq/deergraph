/**
 * Pure run-id resolution for the chat-page Agent Graph integration (Stage 4).
 *
 * On a fresh page load there is no live stream to hand us the active run id, so
 * we recover it from the thread's run list (`apiClient.runs.list`). This keeps
 * the resolution authoritative and testable: newest run wins, never fabricated.
 */

/** Minimal structural shape of a LangGraph `Run` we depend on. */
export interface RunLike {
  run_id: string;
  created_at: string;
}

/** A live run bound to the thread it was started on. */
export interface ActiveRun {
  threadId: string;
  runId: string;
}

/**
 * Return the active run's id only when it belongs to `threadId`. This guards
 * against a run id from a previous thread leaking into a different thread after
 * a thread switch or `/chats/new` (the active run state is not cleared eagerly).
 */
export function selectActiveRunId(
  activeRun: ActiveRun | undefined,
  threadId: string | undefined,
): string | undefined {
  if (!activeRun || !threadId) {
    return undefined;
  }
  return activeRun.threadId === threadId ? activeRun.runId : undefined;
}

/**
 * Return the `run_id` of the most recently created run, or `undefined` when the
 * list is empty / nullish or no entry carries a parseable `created_at`. Does not
 * mutate the input.
 */
export function pickLatestRunId(
  runs: readonly RunLike[] | null | undefined,
): string | undefined {
  if (!runs || runs.length === 0) {
    return undefined;
  }

  let bestId: string | undefined;
  let bestTime = Number.NEGATIVE_INFINITY;

  for (const run of runs) {
    const time = Date.parse(run.created_at);
    if (Number.isNaN(time)) {
      continue;
    }
    if (time > bestTime) {
      bestTime = time;
      bestId = run.run_id;
    }
  }

  return bestId;
}
