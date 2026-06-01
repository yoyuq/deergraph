# DeerGraph

A read-only visual runtime graph for LangGraph multi-agent runs.

DeerGraph turns the events a multi-agent run already persists into a graph you
can look at: who the user asked, which lead agent picked up the request, which
sub-agents it delegated to, and what the final answer was. It is **a library
for drawing that graph** — it holds no business concepts (thread / session /
user), no transport (HTTP client / auth), and no storage backend. Those are
injected by the host. This keeps DeerGraph reusable across any host that can
hand it a stream of run events (DeerFlow today, LangGraph Studio or others
tomorrow).

> Status: Phase 1 — read-only snapshot (`User → Lead Agent → Subagent × N →
> Lead Agent → Final`). No realtime push; near-realtime is opt-in polling.

---

## Table of contents

- [What it looks like](#what-it-looks-like)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Integrating with DeerFlow](#integrating-with-deerflow)
- [HTTP API reference](#http-api-reference)
- [React component API](#react-component-api)
- [Configuration](#configuration)
- [Try it without a backend](#try-it-without-a-backend)

---

## What it looks like

A run that delegates research to two sub-agents renders as five nodes laid out
left-to-right by role:

```
                ┌────────────────┐         ┌──────────────────────────┐
                │                │ delegates│  Subagent                │
                │                ├─────────▶│  "Research DeerFlow…"     │
┌────────┐ input│                │          └──────────────────────────┘
│  User  ├─────▶│   Lead Agent   │          ┌──────────────────────────┐  produces  ┌──────────────┐
└────────┘      │                │ delegates│  Subagent                │            │ Final Answer │
                │                ├─────────▶│  "Research LangGraph…"    │            └──────────────┘
                │                │◀─────────┤                          │                  ▲
                └────────┬───────┘  returns └──────────────────────────┘                  │
                         └─────────────────────────────────────────────────────────────────┘
```

Each node carries a status (pending / running / completed / failed / …), a
summary, optional input/output previews, and a duration. The standalone HTML
demo at [`examples/demo_standalone.html`](../examples/demo_standalone.html)
renders this exact graph — open it in a browser to see it live.

> Screenshot / GIF placeholder — OpenClaw to attach a captured DeerFlow run.

---

## Architecture

DeerGraph is a thin pipeline with a clean injection seam at each end:

```
        host event store                      DeerGraph server (Python)                 DeerGraph React (TS)
  ┌────────────────────────┐   list_events   ┌───────────────────────────────┐  HTTP  ┌──────────────────────┐
  │  RunEventStore /        │◀───────────────│  RunEventSource (Protocol)     │        │  fetchAgentGraph      │
  │  any persisted events   │                │  build_graph_snapshot()        │        │  useAgentGraph (poll) │
  └────────────────────────┘                │  create_router() → FastAPI     │───────▶│  snapshotToFlow()     │
            ▲                                 └───────────────────────────────┘  JSON  │  AgentGraphView /      │
            │ writes events                            │ GraphSnapshot.to_dict()        │  ChatAgentGraphPanel   │
   (the running agent)                                 ▼ camelCase wire format          │  (React Flow canvas)   │
                                          GET /api/visual/runs/{run_id}/graph           └──────────────────────┘
```

Data flow:

1. The host's agent runtime persists run events (`llm.human.input`,
   `llm.ai.response`, `llm.tool.result`, `run.end` / `run.error`).
2. The host adapts its event store to the `RunEventSource` protocol — a single
   `list_events(run_id)` method.
3. `build_graph_snapshot()` sorts events by `seq`, maps them to nodes/edges,
   and returns a `GraphSnapshot`. It is **best-effort**: a malformed event is
   skipped, a builder failure degrades to an empty graph — it never breaks the
   host request and never affects the running task.
4. `create_router()` exposes the snapshot over HTTP as camelCase JSON.
5. The React layer fetches that JSON, converts it to a React Flow graph with a
   deterministic layered layout, and renders it.

Key boundary properties (ADR-004):

- **No host coupling on the server.** `build_graph_snapshot` and
  `create_router` depend only on the `RunEventSource` protocol; swapping the
  backing store (memory / Redis / DB) needs no change in DeerGraph.
- **No backend address baked into the client.** The React package holds no HTTP
  client and no base URL — the host injects both.
- **No thread concept in the components.** Components consume a `runId`; the
  host resolves `thread → run`.

---

## Quick start

DeerGraph is a pnpm + Python monorepo with two packages:

| Package              | Path               | What it provides                                  |
| -------------------- | ------------------ | ------------------------------------------------- |
| `deergraph-server`   | `packages/server`  | Graph builder + FastAPI router (Python ≥ 3.12)    |
| `@deergraph/react`   | `packages/react`   | React components + hooks (React 18/19)            |

> Neither package is published to PyPI / npm yet (ADR-003 §8.4). Consume them
> from the workspace (or as a path/git dependency) for now.

### Server (Python)

```python
from deergraph.runtime import build_graph_snapshot
from deergraph.server import create_router
from deergraph.testing import MemoryRunEventSource  # tests/examples only

# In production, supply your own RunEventSource (see integration below).
event_source = MemoryRunEventSource()

# Mount the read-only router on your FastAPI app.
app.include_router(create_router(event_source=event_source, prefix="/api"))
```

A standalone snapshot, no HTTP:

```python
snapshot = build_graph_snapshot(event_source, thread_id="t1", run_id="r1")
print(snapshot.to_dict())  # camelCase wire format
```

See the runnable example at
[`examples/demo_snapshot.py`](../examples/demo_snapshot.py):

```bash
python examples/demo_snapshot.py
```

### React

```tsx
import {
  configureDeergraph,
  ChatAgentGraphPanel,
} from "@deergraph/react";

// Once, at app bootstrap: tell DeerGraph how to reach the backend.
configureDeergraph({
  fetcher: fetchWithAuth,   // your credentials/CSRF-aware fetch
  baseUrl: "",              // same-origin; or "https://api.example.com"
});

function ChatSidebar({ runId, open, onClose }) {
  return (
    <ChatAgentGraphPanel
      runId={runId}        // host-resolved run id, or null for empty state
      open={open}
      onClose={onClose}
      refetchIntervalMs={open ? 2000 : false}  // near-realtime while open
    />
  );
}
```

`@tanstack/react-query` and `@xyflow/react` are peer/runtime dependencies — make
sure a `QueryClientProvider` wraps the component tree.

---

## Integrating with DeerFlow

DeerFlow is the reference host. Integration is **thin adapters only** — no
changes inside DeerGraph (ADR-004 §Step 5).

### Backend: adapt `RunEventStore` to `RunEventSource`

DeerGraph asks for one method, `list_events(run_id)`, returning persisted events
as plain dicts. Wrap the host store:

```python
from deergraph.server import create_router

class RunEventStoreSource:
    """Adapts DeerFlow's RunEventStore to deergraph's RunEventSource protocol."""

    def __init__(self, store):
        self._store = store

    def list_events(self, run_id: str):
        # Return dicts shaped like:
        # {thread_id, run_id, event_type, category, content, metadata, seq, created_at}
        return self._store.list_for_run(run_id)

router = create_router(
    event_source=RunEventStoreSource(my_store),
    auth_dep=require_permission("visual_runs:read"),  # optional; defaults to noop
    prefix="/api",
)
app.include_router(router)
```

The events DeerGraph reads (message category unless noted):

| `event_type`        | `content` shape it reads                                            |
| ------------------- | ------------------------------------------------------------------- |
| `llm.human.input`   | message text (str or Anthropic block list)                          |
| `llm.ai.response`   | `{ content, tool_calls: [{ id, name: "task", args: {description} }] }` |
| `llm.tool.result`   | `{ tool_call_id, status, content }`                                 |
| `run.end`           | terminal marker (category `terminal`)                               |
| `run.error`         | terminal marker → renders a failed Final node                       |

Sub-agents are detected from `task` tool calls on a lead `llm.ai.response`;
their results are correlated back by `tool_call_id`. Events whose
`metadata.caller` starts with `subagent:` / `middleware:` are intentionally
excluded so the graph stays at the lead-agent level.

### Frontend: resolve `thread → run`, inject the fetcher

DeerGraph components take a `runId`; DeerFlow owns the thread concept and
resolves it in its own integration layer:

```tsx
// host-side glue (lives in DeerFlow, not in deergraph)
function useResolvedRunId(threadId: string): string | null {
  const { data: runs } = useThreadRuns(threadId);   // host's own hook
  return pickLatestRunId(runs) ?? null;
}

configureDeergraph({ fetcher: fetchWithAuth, baseUrl: "" });

function Panel({ threadId, open, onClose }) {
  const runId = useResolvedRunId(threadId);
  return <ChatAgentGraphPanel runId={runId} open={open} onClose={onClose} />;
}
```

> `pickLatestRunId` / `selectActiveRunId` ship in
> `@deergraph/react` (`core/agent-graph/run-id`) as reusable pure helpers, but
> the `thread → run` wiring itself stays host-side.

---

## HTTP API reference

### `GET /api/visual/runs/{run_id}/graph`

Returns the snapshot for one run. The thread id is recovered from the run's
events.

A backward-compatible variant retaining a thread segment also exists:
`GET /api/visual/runs/{thread_id}/{run_id}/graph`.

- **Auth:** controlled by the host via `auth_dep` (default: open).
- **Errors:** never 500s on a builder failure — degrades to an empty graph so
  the visual page renders.

**Response** (`GraphSnapshot`, camelCase, optional fields omitted):

```json
{
  "threadId": "demo-thread-001",
  "runId": "demo-run-001",
  "version": 1,
  "nodes": [
    {
      "id": "user",
      "type": "user",
      "label": "User",
      "status": "completed",
      "threadId": "demo-thread-001",
      "runId": "demo-run-001",
      "startedAt": "2026-06-01T09:00:00+00:00",
      "summary": "Compare DeerFlow and LangGraph, then summarise their differences."
    },
    {
      "id": "subagent:call_research_deerflow",
      "type": "subagent",
      "label": "Subagent",
      "status": "completed",
      "threadId": "demo-thread-001",
      "runId": "demo-run-001",
      "parentId": "lead_agent",
      "correlationId": "call_research_deerflow",
      "durationMs": 11000,
      "summary": "Research DeerFlow architecture and core abstractions.",
      "outputPreview": "DeerFlow uses a super-agent harness with task tool…"
    }
  ],
  "edges": [
    { "id": "edge:user->lead", "source": "user", "target": "lead_agent", "type": "input" },
    {
      "id": "edge:lead->subagent:call_research_deerflow",
      "source": "lead_agent",
      "target": "subagent:call_research_deerflow",
      "type": "delegates",
      "correlationId": "call_research_deerflow"
    }
  ],
  "truncated": false,
  "updatedAt": "2026-06-01T09:00:23+00:00"
}
```

(Run `python examples/demo_snapshot.py` to print the full payload.)

### Node fields

| Field           | Type                                                             | Notes                                              |
| --------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| `id`            | string                                                          | Stable: `user`, `lead_agent`, `subagent:{callId}`, `final` |
| `type`          | `user`/`lead_agent`/`subagent`/`tool`/`final`/`error`           | Drives the layout column                           |
| `status`        | `pending`/`running`/`completed`/`failed`/`cancelled`/`timeout`  | Drives the colour tone                             |
| `parentId`      | string?                                                         | Sub-agents and Final point at `lead_agent`         |
| `correlationId` | string?                                                         | The `task` tool-call id                            |
| `startedAt` / `endedAt` | ISO string?                                            | From event `created_at`                            |
| `durationMs`    | number?                                                         | Derived from start/end                             |
| `summary` / `inputPreview` / `outputPreview` / `error` | string?                       | Sanitized text previews                            |

### Edge types

`input` (User→Lead), `delegates` (Lead→Subagent), `returns` (Subagent→Lead),
`produces` (Lead→Final), `uses_tool` (reserved).

### `truncated`

If a run exceeds the safety cap (`DEFAULT_MAX_EVENTS = 2000` message events),
the snapshot is capped and `truncated: true` — events are never silently
dropped. `metadata.orphanResults` counts tool results with no matching delegation.

---

## React component API

All exported from `@deergraph/react` (also `@deergraph/react/components` and
`@deergraph/react/types`).

### `ChatAgentGraphPanel`

Drop-in side panel for a chat UI. Owns no business state and never fabricates a
run id.

```ts
interface ChatAgentGraphPanelProps {
  runId: string | null;              // null → empty-state hint
  open: boolean;                     // gates the query; closed panel is inert
  refetchIntervalMs?: number | false; // polling cadence; pass a number only while the run is active
  onClose: () => void;
  className?: string;
}
```

### `AgentGraphView`

Presentational orchestrator behind the panel — maps query state onto
loading/error/empty/canvas branches and owns node selection. Decoupled from
react-query so it takes plain props (used by the standalone full-screen page).

```ts
interface AgentGraphViewProps {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  data: AgentGraphSnapshot | undefined;
  onRetry?: () => void;
  className?: string;
}
```

### `configureDeergraph` / `DeergraphProvider`

Runtime injection (ADR-004 contracts 3 & 4). Resolution precedence:
**Context value > global config > defaults** (`globalThis.fetch`, same-origin `""`).

```ts
configureDeergraph({ fetcher, baseUrl });          // process-wide default
<DeergraphProvider value={{ fetcher, baseUrl }}>…   // per-subtree override (SSR / multi-tenant)
```

### Data hooks & helpers

| Export              | Purpose                                                            |
| ------------------- | ----------------------------------------------------------------- |
| `useAgentGraph`     | react-query hook: load a run's snapshot, opt-in polling           |
| `fetchAgentGraph`   | Plain async fetch of the snapshot                                 |
| `agentGraphQueryKey`| Stable query key for cache control                                |
| `snapshotToFlow`    | Pure `GraphSnapshot → React Flow nodes/edges` (layered layout)    |

```ts
const query = useAgentGraph(runId, { enabled: open, refetchIntervalMs: 2000 });
```

---

## Configuration

| Option              | Where                              | Default            | Meaning                                                  |
| ------------------- | ---------------------------------- | ------------------ | -------------------------------------------------------- |
| `fetcher`           | `configureDeergraph` / `DeergraphProvider` | `globalThis.fetch` | The fetch used for the snapshot request                  |
| `baseUrl`           | `configureDeergraph` / `DeergraphProvider` | `""` (same-origin) | Prefixed to the API path                                 |
| `refetchIntervalMs` | `ChatAgentGraphPanel` / `useAgentGraph` | `false` (no poll)  | Near-realtime polling cadence; clear it when the run ends |
| `auth_dep`          | `create_router` (Python)           | noop (open)        | FastAPI auth dependency for the route                    |
| `prefix`            | `create_router` (Python)           | `""`               | Router mount prefix (e.g. `"/api"`)                      |
| `max_events`        | `build_graph_snapshot` (Python)    | `2000`             | Safety cap before `truncated: true`                      |

---

## Try it without a backend

- **Python:** `python examples/demo_snapshot.py` builds a realistic 2-subagent
  run from `MemoryRunEventSource` and prints the wire-format JSON.
- **Browser:** open
  [`examples/demo_standalone.html`](../examples/demo_standalone.html) directly —
  it embeds that same snapshot and renders the graph with zero dependencies.

For demo scripts and recommended prompts, see
[`docs/demo/deergraph-demo.md`](demo/deergraph-demo.md) and
[`docs/demo/deergraph-prompts.md`](demo/deergraph-prompts.md).
