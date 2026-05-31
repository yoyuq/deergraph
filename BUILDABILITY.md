# BUILDABILITY.md

最后更新：2026-05-31 23:03 (Asia/Shanghai) — OpenClaw (main agent)

DeerGraph 仓库当前已完成 Step 4b：结构完整，并且可独立 typecheck / test。本文档保留原阻塞分析，同时记录已完成的契约实现与验收结果。

## Step 4b 验收结果

```powershell
cd C:\Users\hjl\Projects\deergraph
pnpm -r typecheck  # exit 0
pnpm -r test       # @deergraph/react: 8 files / 63 tests passed

cd C:\Users\hjl\Projects\deergraph\packages\server
.\.venv\Scripts\python -m pip install -e .[dev]
.\.venv\Scripts\python -m pytest -q  # 56 passed, 1 warning
```

已实现：

- Python `RunEventSource` Protocol；`builder.py` 不再依赖 deer-flow 的 `RunEventStore`。
- Python `create_router(event_source, auth_dep, prefix)`；router 不再 import `app.gateway.*`。
- Python `MemoryRunEventSource` 测试源。
- React `configureDeergraph` + `DeergraphProvider`；Context config 优先于 global config。
- React 本地 `cn`、Button fallback、ScrollArea fallback。
- `ChatAgentGraphPanel` 改为 `runId` only；deergraph 不再解析 `thread -> run`。

## 原阻塞分析（已在 Step 4b 解决）

## 当前结构

```
packages/
├─ server/                # Python: deergraph runtime + FastAPI router
│  ├─ pyproject.toml
│  ├─ deergraph/
│  │  ├─ runtime/          # models, sanitizer, event_mapper, builder
│  │  └─ server/router.py  # 原 visual_runs.py
│  └─ tests/
└─ react/                 # TypeScript: @deergraph/react
   ├─ package.json
   ├─ tsconfig.json
   ├─ vitest.config.ts
   ├─ src/
   │  ├─ core/agent-graph/
   │  └─ components/agent-graph/
   └─ tests/
examples/
└─ standalone-page/page.tsx
docs/plans/...
decisions/...
discussions/...
```

## Python — packages/server

### 自洽部分（可直接 import / 跑测试）

- `deergraph/runtime/models.py`
- `deergraph/runtime/sanitizer.py`
- `deergraph/runtime/event_mapper.py`
- `deergraph/runtime/builder.py`
- `deergraph/runtime/__init__.py`
- `tests/test_graph_event_mapper.py`
- `tests/test_graph_sanitizer.py`

这些模块原本就只引用 `deerflow.runtime.graph.*` 同包内兄弟，搬到 `deergraph.runtime.*` 是**纯路径 rename**，没有真正的外部依赖。修法：把所有 `from deerflow.runtime.graph...` 改成 `from deergraph.runtime...`。

### 外部依赖（需要契约抽取，ADR-003 §4）

| 文件 | 当前 import | 处理方式 |
|------|-------------|----------|
| `deergraph/runtime/builder.py` | `from deerflow.runtime.events.store.base import RunEventStore` | ADR-003 §4.1：抽 `RunEventSource` Protocol，replace |
| `deergraph/server/router.py`   | `from deerflow.runtime.graph import GraphSnapshot, build_graph_snapshot` | 内部 rename → `from deergraph.runtime import ...` |
| `deergraph/server/router.py`   | `from app.gateway.authz import require_permission` | ADR-003 §4.2：抽 Auth dependency factory |
| `deergraph/server/router.py`   | `from app.gateway.deps import get_run_event_store` | ADR-003 §4.1 同源 |
| `tests/test_graph_builder.py`  | `from deerflow.runtime.events.store.memory import MemoryRunEventStore` | 测试需要一个 in-memory fake，建议 deergraph 自带 `deergraph.testing.MemoryRunEventStore` |
| `tests/test_visual_runs_router.py` | `from app.gateway.routers import visual_runs` | rename → 测试 deergraph 自己的 `router` module |
| `tests/test_visual_runs_router.py` | `from _router_auth_helpers import make_authed_test_app` | 移植 helper 到 `tests/conftest.py` 或 `tests/_helpers.py` |

## TypeScript — packages/react

### 自洽部分（仅路径 rename）

- `core/agent-graph/*` 自引用 → 改成相对路径或 tsconfig path alias（已在 tsconfig `@/*` 配好）。
- `components/agent-graph/*` 自引用 → 同上。

### 第三方 npm（已在 package.json 声明）

- `@xyflow/react`
- `@tanstack/react-query`
- `clsx` + `tailwind-merge`（供本地实现 `cn`）
- React 19 / react-dom 19（peer + devDep 测试用）

### deer-flow host 契约（需要由 host 注入或 deergraph 提供 fallback）

| 引用 | 文件 | 处理方式 |
|------|------|----------|
| `@/components/ui/button` | `agent-graph-states.tsx`, `chat-agent-graph-panel.tsx` | 抽 `ButtonComponent` prop，or 让 deergraph 自带最小 unstyled `<button>` fallback |
| `@/components/ui/scroll-area` | `agent-graph-details-panel.tsx` | 同上；fallback 用原生 `<div style={{overflow:'auto'}}>` |
| `@/lib/utils` 的 `cn` | 多文件 | deergraph 自带：在 `src/lib/cn.ts` 实现 `clsx + twMerge`，并把所有 `@/lib/utils` 改为相对引用 |
| `@/core/api/fetcher` 的 `fetch as fetchWithAuth` | `core/agent-graph/api.ts` | ADR-003 §4.3：`configureDeergraph({ fetcher })` 注入；默认 fallback = global fetch |
| `@/core/config` 的 `getBackendBaseURL` | `core/agent-graph/api.ts` | 同上：`configureDeergraph({ baseUrl })`，默认 `""`（同源） |
| `@/core/threads/hooks` 的 `useThreadRuns` | `core/agent-graph/use-resolved-run-id.ts` | ADR-003 §4.3：把 `useThreadRuns` 抽成构造器 prop / context 注入；deergraph 暴露 `<DeergraphProvider value={{ useThreadRuns }}>` |

## 阻塞分级

1. **L1 内部 rename**（机械、低风险）：deerflow → deergraph 包名替换；`@/*` 与相对路径整理。
2. **L2 host UI fallback**（中风险）：cn 自带 + Button/ScrollArea fallback 或 prop 注入。
3. **L3 契约边界**（高风险）：RunEventSource Protocol / Auth factory / fetcher / config / useThreadRuns 五大注入点设计。

## 责任分工

- **Step 4b（L1 + L2）由 Claude Code 执行**，单 commit。OpenClaw 写提示词放 `discussions/2026-05-31-step4b-prompt.md`。
- **Step 4c（L3 契约边界）需要用户回归后决策**，因为这是 deergraph 对外 API 的形状，影响后续 deer-flow 集成层的写法。OpenClaw 不在用户睡眠期单方面定型公共 API。

## 验收基线（Step 4b 完成后期望）

```
cd C:\Users\hjl\Projects\deergraph
pnpm install
pnpm -r test         → @deergraph/react 测试全绿
pnpm -r typecheck    → 干净
cd packages/server
pip install -e .[dev]
pytest               → 全绿
```

L3 契约边界没接通时，host 集成（deer-flow ChatPage 把 `<ChatAgentGraphPanel>` 挂回去）暂不可用——这是预期的，由 Step 4c 之后的工作处理。
