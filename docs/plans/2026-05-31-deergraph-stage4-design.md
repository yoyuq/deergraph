# DeerGraph Stage 4 — Chat Tab Integration + Near-Realtime (Design Exploration)

Status: Phase 4A design only. No functional code written yet.
Scope: integrate the Stage-3 Agent Graph into the chat page + near-realtime via
polling first. SSE/GraphDelta deferred to 4B/Stage 5. No new WebSocket, no new
`subagent.*` events, no backend changes to `task_tool.py` / `worker.py` /
`RunEventStore`.

## 1. Chat page main component

- `frontend/src/app/workspace/chats/[thread_id]/page.tsx` → `ChatPage`.
  Wraps `ThreadContext.Provider` + `ChatBox`; header (`ThreadTitle`,
  `TokenUsageIndicator`, `ExportTrigger`, `ArtifactTrigger`) over a `<main>`
  with `MessageList` + `InputBox`.
- Layout/providers: `layout.tsx` → `ChatProviders`
  (`SubtasksProvider` → `ArtifactsProvider` → `PromptInputProvider`).
- `QueryClientProvider` is mounted higher up (workspace layout), so react-query
  hooks work inside the chat page.

## 2. Current "Chat / Files" UI

There is **no tab system**. What looks like "Files" is `ArtifactTrigger`
(`components/workspace/artifacts/artifact-trigger.tsx`): a header `Button` that
opens an artifacts overlay panel driven by `ArtifactsProvider` context. The
established pattern is **header trigger button → overlay/side panel**, not tabs.

→ We mirror that pattern for Agent Graph rather than introducing a Tabs
component and restructuring the page.

## 3. How thread_id is obtained

- `useThreadChat()` → `threadId` (canonical in-page source; also the
  `[thread_id]` route param). Stable and always available.

## 4. Can we reliably get run_id?

**Yes — two real sources, no mocking, no hardcoding:**

1. **Live (active run):** the stream lifecycle already surfaces it.
   `useThreadStream({ onStart: (threadId, runId) => … })` and the underlying
   `useStream({ onCreated(meta) { …meta.run_id… } })`
   (`core/threads/hooks.ts:342-343`). The chat page currently **ignores** the
   `runId` arg of `onStart` (`page.tsx:86`). We lift it into page state.
   → 100% reliable for runs started in the current session.

2. **Historical / after refresh / reconnect:** `useThreadRuns(threadId)`
   (`core/threads/hooks.ts:989`) calls `apiClient.runs.list(threadId)` and
   returns `Run[]` (each has `run_id`, `created_at`, `status`). Pick the most
   recent. Real backend call.

**Resolution rule:** prefer the live active `runId` (from `onStart`); if absent
(fresh page load with no active stream), fall back to the latest run from
`useThreadRuns`. Both paths are real; neither fabricates an id.

Testable pure helper: `pickLatestRunId(runs: Run[]): string | undefined`
(sort by `created_at` desc, return newest `run_id`). Unit-tested with fixtures.

> Note: `getLatestRunIdFromMessages` is **not** needed — flattened
> `thread.messages` do not reliably carry `run_id` (run_id lives on the
> per-run history fetch / `RunMessage`, not on the merged `Message[]`). The
> `runs.list` path is cleaner and authoritative, so we use that instead.

**Degraded state:** if neither source yields a run_id (brand-new thread, no run
yet), show an Empty/Hint state: *"Run or select a conversation turn to view its
Agent Graph."* No mock, no placeholder id.

## 5. Minimal viable run_id plan

`useResolvedRunId(threadId, liveRunId?)`:
- returns `liveRunId` when present;
- else reads `useThreadRuns(threadId)` and returns `pickLatestRunId(runs)`;
- else `undefined` → panel renders Empty/Hint.

This keeps `useAgentGraph(threadId, runId)`'s existing `enabled` guard
(disabled until both ids present) doing exactly the right thing.

## 6. Recommended minimal integration point

Mirror `ArtifactTrigger`, do **not** restructure the page:

- **Trigger:** an `AgentGraphTrigger` header button (next to `ArtifactTrigger`)
  toggling a boolean.
- **Container:** `components/workspace/agent-graph/chat-agent-graph-panel.tsx`
  — a thin client component that:
  - takes `threadId` + resolved `runId` (+ `open`/`onClose`);
  - calls `useAgentGraph(threadId, runId, { enabled: open, refetchIntervalMs })`;
  - renders the **existing** `AgentGraphView` (which reuses `AgentGraphCanvas`,
    details panel, states) inside an overlay/side panel.
- **State:** lift `graphOpen` + `activeRunId` into `ChatPage` (`activeRunId`
  captured from `onStart`'s second arg). No new context provider.
- **Isolation:** graph errors are contained in `AgentGraphView`'s error branch
  and never touch the chat stream. Wrap the panel body in an error boundary so a
  graph crash can't take down the chat page.
- **Standalone page kept as-is:**
  `app/workspace/chats/[thread_id]/runs/[run_id]/graph/page.tsx` remains for
  full-screen demo.

Entry label intent: `Chat | Files | Agent Graph` — realized as the existing
artifacts ("Files") button plus the new Agent Graph button, both in the header.

## 7. Recommended polling strategy (4C)

Extend `useAgentGraph` with an options arg (backwards compatible):

```ts
useAgentGraph(threadId, runId, {
  enabled?: boolean,            // default true (preserves current callers)
  refetchIntervalMs?: number | false,  // default false (no polling)
})
```

- **Standalone page:** no polling (or low-frequency), preserving Stage-3 behavior.
- **Chat panel:** poll only when **panel is open AND the run is in progress**
  (derive "in progress" from `thread.isLoading` / run status). Suggested
  interval **2500 ms**. When the run finishes or the panel closes, set
  `refetchIntervalMs: false` (stop), after one final fetch so the terminal graph
  is shown. Also `enabled: open` so a closed panel does zero network work.
- Keeps `staleTime`/`refetchOnWindowFocus:false`; reconnect/refresh recovers by
  re-resolving run_id and re-fetching the snapshot (already idempotent GET).

## 8. Out of scope / deferred

- SSE / `GraphDelta` from existing run-event stream → Stage 4B / 5.
- No new WebSocket, no `/graph/stream`, no parallel `subagent.*` events.
- No backend changes; Stage-1 snapshot API is the only data path.

## 9. Implementation order (test-first)

1. `pickLatestRunId` pure helper + tests.
2. `useResolvedRunId` (thin) — covered via component test of the panel.
3. Extend `useAgentGraph` options (`enabled`, `refetchIntervalMs`) + tests
   (assert enabled gating and refetchInterval wiring; existing 2-arg callers
   unchanged).
4. `ChatAgentGraphPanel` component + tests (empty/hint when no run_id, renders
   `AgentGraphView` when run_id present, canvas mocked).
5. `AgentGraphTrigger` + minimal `ChatPage` wiring (capture `onStart` runId,
   toggle panel). Smoke-level.
6. Full `pnpm test` + `pnpm typecheck`; stop for review.
