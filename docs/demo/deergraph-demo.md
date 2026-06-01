# DeerGraph Demo Walkthrough

How to demonstrate DeerGraph end-to-end against a live DeerFlow instance, plus a
zero-backend fallback for quick demos.

Audience: developers and technical decision-makers evaluating DeerGraph.

---

## Two ways to demo

| Mode                  | Needs                          | Use when                                            |
| --------------------- | ------------------------------ | --------------------------------------------------- |
| **A. Live DeerFlow**  | DeerFlow running + integrated  | Showing the real product flow end-to-end            |
| **B. Zero backend**   | Just a browser / Python        | Quick demo, no infra, or showing the data shape     |

Start with Mode B to explain the graph, then switch to Mode A for the real run.

---

## Mode A — Live DeerFlow

### Prerequisites

1. DeerFlow is running with the DeerGraph integration wired in:
   - Backend mounts `create_router(event_source=…)` (the `RunEventStore`
     adapter — see [integration guide](../deergraph.md#integrating-with-deerflow)).
   - Frontend calls `configureDeergraph({ fetcher, baseUrl })` at bootstrap and
     renders `ChatAgentGraphPanel` with a host-resolved `runId`.
2. The `deergraph` packages are installed in the DeerFlow workspace.
3. A model/provider with API access is configured in DeerFlow (no keys needed in
   DeerGraph itself).

### Steps

1. Open a DeerFlow chat thread.
2. Send a **multi-subagent prompt** — one that the lead agent will decompose
   into **≥ 2 `task` delegations**. Pick one from
   [`deergraph-prompts.md`](deergraph-prompts.md).
3. While the run is in progress, open the **Agent Graph** panel.
   - With `refetchIntervalMs` set, nodes appear as events land: sub-agents start
     as `pending`/`running`, then flip to `completed` with a duration.
4. When the run finishes, the **Final Answer** node appears and the panel can
   stop polling.
5. Click any node to inspect its summary, input/output preview, and timing in
   the details panel.

### What to point out

- Sub-agents are detected purely from persisted events — DeerGraph adds **no
  instrumentation** to the agent runtime and **never affects the running task**.
- The graph is **read-only** and **best-effort**: a malformed event is skipped,
  and a builder failure degrades to an empty graph rather than erroring the page.
- The same snapshot endpoint powers both the in-chat panel and a full-screen
  standalone page.

---

## Mode B — Zero backend

### B1. Browser (no install)

Open [`examples/demo_standalone.html`](../../examples/demo_standalone.html)
directly in any browser. It embeds a realistic 2-subagent snapshot and renders
the graph with vanilla SVG — no server, no build step. Click nodes to see the
details panel.

### B2. Python (print the wire payload)

```bash
python examples/demo_snapshot.py
```

This feeds a realistic event sequence through `MemoryRunEventSource` and
`build_graph_snapshot()`, printing the exact camelCase JSON the live API would
return. Good for showing the data contract without standing up FastAPI.

---

## Expected graph shape

The canonical Phase-1 MVP shape is:

```
User → Lead Agent → Subagent × N → Lead Agent → Final
```

For the bundled 2-subagent demo, the snapshot has **5 nodes** and **6 edges**:

| Node                              | Type        | Status      |
| --------------------------------- | ----------- | ----------- |
| `user`                            | user        | completed   |
| `lead_agent`                      | lead_agent  | completed   |
| `subagent:call_research_deerflow` | subagent    | completed   |
| `subagent:call_research_langgraph`| subagent    | completed   |
| `final`                           | final       | completed   |

Edges: `input` (User→Lead), `delegates` ×2 (Lead→Subagent), `returns` ×2
(Subagent→Lead), `produces` (Lead→Final).

Layout (left → right by role column):

- Column 0: **User**
- Column 1: **Lead Agent**
- Column 2: **Subagents** (stacked vertically, one row each)
- Column 3: **Final Answer**

### Variations to expect with real runs

- **More sub-agents** → more rows in column 2; the lead fans out and back in.
- **A failed sub-agent** → that node renders `failed` (red tone); the run can
  still complete.
- **`run.error`** → a single `error`-type Final node ("Run Failed") instead of a
  normal Final Answer.
- **Very long runs** → `truncated: true` once the event cap is hit (events are
  capped, never silently dropped).

---

## Screenshots / GIF

> Placeholders — OpenClaw to attach captured media from a real DeerFlow run.

- `![DeerGraph chat panel](./media/deergraph-chat-panel.png)` — in-chat side panel
- `![DeerGraph full screen](./media/deergraph-fullscreen.png)` — standalone page
- `![DeerGraph near-realtime](./media/deergraph-realtime.gif)` — sub-agents
  flipping pending → completed during a live run

---

## Talk track (≈ 2 minutes)

1. "Here's a multi-agent run as a picture." — open Mode B in the browser.
2. "Every node comes from events the run already persists — no extra
   instrumentation, fully read-only." — click a sub-agent node, show the
   input/output preview and duration.
3. "DeerGraph is just a drawing library: the host injects the event source, the
   auth, and the backend URL." — point at the architecture diagram in
   [`deergraph.md`](../deergraph.md#architecture).
4. "Now the real thing." — switch to Mode A, send a prompt, open the panel, watch
   it fill in near-realtime.
