# DeerGraph

> A visual runtime graph for DeerFlow multi-agent execution.

DeerGraph renders real-time execution graphs showing how DeerFlow's lead agent
delegates tasks to sub-agents, how tool calls flow, and how results converge —
all as an interactive node-and-edge diagram powered by React Flow.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Your LangGraph Agent                      │
│                                                               │
│  RunEventStore ──▶ RunEventSource (adapter) ──▶ Graph Builder│
│                                                       │      │
│                                          GraphSnapshot (JSON) │
│                                                       │      │
│  ┌─────────────────────────────────────────────────────┐     │
│  │           FastAPI: GET /graph                        │     │
│  └──────────────────────┬──────────────────────────────┘     │
│                         │ SSE / polling                       │
│  ┌──────────────────────▼──────────────────────────────┐     │
│  │     @deergraph/react (ChatAgentGraphPanel)          │     │
│  │     React Flow + TanStack Query                     │     │
│  └─────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`packages/server`](./packages/server) | 0.1.0 | Python: graph models, event mapper, builder, FastAPI router |
| [`packages/react`](./packages/react) | 0.1.0 | React: `ChatAgentGraphPanel`, `AgentGraphView`, hooks, types |

## Quick Start

### 1. Install the Python package

```bash
# From GitHub (recommended)
pip install "deergraph-server @ git+https://github.com/yoyuq/deergraph@main#subdirectory=packages/server"

# Or with uv
uv add "deergraph-server @ git+https://github.com/yoyuq/deergraph@main#subdirectory=packages/server"
```

### 2. Install the React package

```bash
# From GitHub (recommended)
pnpm add @deergraph/react@github:yoyuq/deergraph#main

# Or npm
npm install @deergraph/react@github:yoyuq/deergraph#main
```

### 3. Backend: Expose the graph API

```python
from deergraph.runtime.ports import RunEventSource
from deergraph.server.router import create_router

# 1) Implement the RunEventSource port for your event store
class MyEventSource(RunEventSource):
    def get_events(self, thread_id: str, run_id: str) -> list[RunEvent]:
        # Query your LangGraph RunEventStore / database here
        ...

# 2) Create and mount the FastAPI router
router = create_router(event_source=MyEventSource())
app.include_router(router, prefix="/api/visual")
```

### 4. Frontend: Render the graph panel

```tsx
import {
  ChatAgentGraphPanel,
  DeergraphProvider,
  type DeergraphRuntimeConfig,
} from "@deergraph/react";

// Build the runtime config for your thread
const runtime: DeergraphRuntimeConfig = {
  threadId: "your-thread-id",
  // Optionally override the API base URL:
  // baseUrl: "http://localhost:8000/api/visual",
};

function App() {
  return (
    <DeergraphProvider value={runtime}>
      <ChatAgentGraphPanel />
    </DeergraphProvider>
  );
}
```

## DeerFlow Integration

DeerGraph is designed as a standalone package that integrates into any
LangGraph-based agent system. For the reference DeerFlow integration, see:

- **Backend**: `RunEventStoreSource` adapts DeerFlow's `RunEventStore` → DeerGraph's `RunEventSource` port
- **Frontend**: `createDeerFlowDeergraphRuntime()` in `@/core/deergraph/runtime`

The integration adds exactly **2 files** to the host project:
1. A thin adapter implementing the `RunEventSource` port
2. A runtime config factory for the React provider

## API Reference

### `GET /api/visual/runs/{thread_id}/{run_id}/graph`

Returns a `GraphSnapshot` JSON:

```json
{
  "thread_id": "...",
  "run_id": "...",
  "nodes": [
    { "id": "user-1", "role": "user", "label": "User", "status": "completed" },
    { "id": "agent-1", "role": "lead_agent", "label": "Lead Agent", "status": "completed" },
    { "id": "sub-1", "role": "subagent", "label": "Research Subagent", "status": "running" }
  ],
  "edges": [
    { "source": "user-1", "target": "agent-1", "label": "request" },
    { "source": "agent-1", "target": "sub-1", "label": "task" }
  ],
  "built_at": "2026-06-01T09:00:23Z"
}
```

### React Components

| Export | Description |
|--------|-------------|
| `ChatAgentGraphPanel` | Drop-in panel: graph + detail sidebar + auto-refresh |
| `AgentGraphView` | Core graph canvas with React Flow |
| `DeergraphProvider` | Context provider for runtime config |
| `configureDeergraph` | Hook to set/override runtime config |
| `useGraphSnapshot` | Low-level hook: fetch + poll a snapshot |

### Configuration

| Prop / Option | Default | Description |
|---------------|---------|-------------|
| `threadId` | *(required)* | LangGraph thread ID |
| `baseUrl` | `""` (same-origin) | API base URL for graph endpoint |
| `refetchIntervalMs` | `2000` | Polling interval for near-realtime updates |

## Examples

- **`examples/demo_snapshot.py`** — Python-only: build a mock snapshot and print JSON. No server needed.
- **`examples/demo_standalone.html`** — Browser-only: open the file to see a static graph with mock data.

## Development

```bash
# Clone
git clone https://github.com/yoyuq/deergraph.git
cd deergraph

# Install dependencies
pnpm install

# Build React package
pnpm --filter @deergraph/react build

# Run Python tests
cd packages/server
python -m pytest -q

# Run React tests
pnpm -r test

# Type-check everything
pnpm -r typecheck
```

## License

MIT
