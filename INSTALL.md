# Installation Guide for DeerGraph

DeerGraph is distributed as two standalone packages installable directly from GitHub.

## Python Package (`deergraph-server`)

### With pip

```bash
pip install "deergraph-server @ git+https://github.com/yoyuq/deergraph@main#subdirectory=packages/server"
```

### With uv

```bash
uv add "deergraph-server @ git+https://github.com/yoyuq/deergraph@main#subdirectory=packages/server"
```

### In pyproject.toml (for project integration)

```toml
[project]
dependencies = [
    "deergraph-server",
]

[tool.uv.sources]
deergraph-server = { git = "https://github.com/yoyuq/deergraph.git", subdirectory = "packages/server", branch = "main" }
```

### Verify

```python
from deergraph.runtime.builder import build_graph_snapshot
from deergraph.testing import MemoryRunEventSource
print("deergraph-server installed OK")
```

## React Package (`@deergraph/react`)

### With npm

```bash
npm install "@deergraph/react@git+https://github.com/yoyuq/deergraph.git#main"
```

### With yarn

```bash
yarn add "@deergraph/react@git+https://github.com/yoyuq/deergraph.git#main"
```

### With pnpm

> **Note:** pnpm resolves git URLs via SSH by default. If you don't have SSH
> keys configured for GitHub, use one of these workarounds:

**Option A:** Configure git to use HTTPS instead of SSH:

```bash
git config --global url."https://github.com/".insteadOf "git+ssh://git@github.com/"
git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
pnpm add "@deergraph/react@git+https://github.com/yoyuq/deergraph.git#main"
```

**Option B:** Clone the repo and install locally:

```bash
git clone https://github.com/yoyuq/deergraph.git
pnpm add ./deergraph/packages/react
```

### Verify

```tsx
import { ChatAgentGraphPanel, DeergraphProvider } from "@deergraph/react";
console.log("@deergraph/react installed OK");
```

## Integrating into DeerFlow

### Backend

1. Add `deergraph-server` to your dependencies (see above).
2. Implement the `RunEventSource` port:

```python
from deergraph.runtime.ports import RunEventSource, RunEvent

class MyRunEventSource(RunEventSource):
    def get_events(self, thread_id: str, run_id: str) -> list[RunEvent]:
        # Query your RunEventStore / database here
        ...
```

3. Create and mount the router:

```python
from deergraph.server.router import create_router

router = create_router(event_source=MyRunEventSource())
app.include_router(router, prefix="/api/visual")
```

### Frontend

1. Add `@deergraph/react` to your dependencies (see above).
2. Use the components:

```tsx
import {
  ChatAgentGraphPanel,
  DeergraphProvider,
  type DeergraphRuntimeConfig,
} from "@deergraph/react";

const runtime: DeergraphRuntimeConfig = {
  threadId: "your-thread-id",
};

function App() {
  return (
    <DeergraphProvider value={runtime}>
      <ChatAgentGraphPanel />
    </DeergraphProvider>
  );
}
```

## Troubleshooting

### `git ls-remote` fails with "Host key verification failed"

Git is trying to use SSH. Fix with:

```bash
git config --global url."https://github.com/".insteadOf "git+ssh://git@github.com/"
```

### `pip install` fails with SSL errors

If you're behind a proxy:

```bash
pip install --proxy http://your-proxy:port "deergraph-server @ git+https://github.com/yoyuq/deergraph@main#subdirectory=packages/server"
```

### React package types not found

Make sure your `tsconfig.json` has `"moduleResolution": "Bundler"` or `"NodeNext"`, and that `@deergraph/react` appears in your `node_modules`.
