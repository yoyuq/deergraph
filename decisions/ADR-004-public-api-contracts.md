# ADR-004: DeerGraph 公共 API 契约定型

- 状态：ACCEPTED
- 日期：2026-05-31
- 决策者：用户 yoyuq
- 草拟：OpenClaw (main agent)
- 关联：ADR-001（独立仓库）、ADR-003（迁移策略 §4 五个契约边界）

## 背景

ADR-003 §4 列出了 deergraph 从 deer-flow 独立后必须抽象的五个契约边界（L3）。Step 4a 在 `BUILDABILITY.md` 把它们记成了 TODO，本 ADR 把每个契约的对外 API 形状定型，作为 Step 4b 与所有后续集成的约束。

deergraph 的核心定位：**一个看图的库**。不持有业务概念（thread / 会话 / 用户），不持有传输方式（HTTP 客户端 / 鉴权），不持有数据存储（事件源后端）。所有这些通过注入契约由 host 提供。

## 决议

### 契约 1 — `RunEventSource`（Python，后端事件源）

形状：**Protocol**。

```python
# packages/server/deergraph/runtime/ports.py
from typing import Protocol, Sequence
from .models import RunEvent

class RunEventSource(Protocol):
    def list_events(self, run_id: str) -> Sequence[RunEvent]: ...
```

- `builder.py` 接收 `RunEventSource` 实例，不再 import `RunEventStore`。
- deergraph 在 `deergraph.testing` 提供 `MemoryRunEventSource` 给单测用。
- host（deer-flow）在自家 `RunEventStore` 上写一个 thin adapter（一两个方法）即可。

理由：Protocol 用鸭子类型不强制继承；将来接 Redis / Kafka / 数据库不动 deergraph。

### 契约 2 — Auth 工厂（Python，FastAPI 路由）

形状：**工厂函数 `create_router`**。

```python
# packages/server/deergraph/server/router.py
from collections.abc import Callable
from fastapi import APIRouter, Depends

def _noop_auth() -> None: return None

def create_router(
    *,
    event_source: RunEventSource,
    auth_dep: Callable[..., object] = _noop_auth,
    prefix: str = "",
) -> APIRouter:
    router = APIRouter(prefix=prefix)

    @router.get("/visual/runs/{run_id}/graph", dependencies=[Depends(auth_dep)])
    def get_graph(run_id: str): ...

    return router
```

- 默认 `auth_dep` = noop，开箱即用。
- host 想做权限校验：`create_router(event_source=..., auth_dep=require_permission("visual_runs:read"))`。

理由：无全局可变状态；权限粒度由 host 控制；测试好写。

### 契约 3 — `fetcher` / 配置（前端 HTTP 客户端 + base URL）

形状：**全局 `configureDeergraph` 兜底 + `DeergraphProvider` Context 覆盖**。

```ts
// packages/react/src/runtime-config.ts
export interface DeergraphRuntimeConfig {
  fetcher?: typeof fetch;
  baseUrl?: string;
}

// 全局默认（适合 vanilla / single-tenant）
export function configureDeergraph(cfg: DeergraphRuntimeConfig): void;

// React Context 局部覆盖（适合 SSR / 多账户 / 微前端）
export const DeergraphProvider: React.FC<{
  value: DeergraphRuntimeConfig;
  children: React.ReactNode;
}>;

// 内部 hook，优先取 Context，回退到全局默认，再回退到 globalThis.fetch / 同源
export function useDeergraphRuntime(): Required<DeergraphRuntimeConfig>;
```

API 调用：

```ts
const { fetcher, baseUrl } = useDeergraphRuntime();
return fetcher(`${baseUrl}/api/visual/runs/${runId}/graph`);
```

理由：
- 全局 configure 简单场景一行搞定。
- Context 解决 SSR、多租户、微前端、测试隔离。
- 两者并存，Context 优先级高，回退路径明确。

### 契约 4 — `baseUrl`（前端后端地址）

形状：**跟契约 3 合并**，不单独抽。`configureDeergraph({ baseUrl })` 或 `DeergraphProvider value={{ baseUrl }}` 同时设置。默认 `""` 走同源。

### 契约 5 — `useThreadRuns` Hook（前端 thread→run 解析）

形状：**deergraph 不承担 thread 概念，组件仅吃 `runId`**。

`ChatAgentGraphPanel` 的对外 props：

```ts
export interface ChatAgentGraphPanelProps {
  runId: string | null;        // host 解析后传入；null 时面板显示 empty state
  open: boolean;
  onClose: () => void;
  // 可选：滚动 / 主题 / className 等 UI 配置
}
```

- 原 `use-resolved-run-id.ts` 模块**从 deergraph 移除**（或仅保留为 `examples/` 演示）。
- host (deer-flow) 在自家集成层写 `useResolvedRunId(threadId)`，用自己的 `useThreadRuns`，把 runId 传进来。

理由：
- deergraph 是看图库，"会话/线程"是产品概念；将来 LangGraph Studio 等其它 host 没有 thread。
- host 多写 10 行代码，换 deergraph API 干净 100%。
- 测试只 mock runId，比 mock hook 简单。

## 公共 API 全景（Step 4b 之后）

### `@deergraph/react`

```ts
// 配置
export { configureDeergraph, DeergraphProvider } from "@deergraph/react";

// 顶层组件
export {
  AgentGraphView,           // 给 examples/standalone-page 用
  ChatAgentGraphPanel,      // 给 host 集成层用
} from "@deergraph/react/components";

// 类型
export type {
  GraphSnapshot,
  GraphNode,
  GraphEdge,
  ChatAgentGraphPanelProps,
  DeergraphRuntimeConfig,
} from "@deergraph/react/types";
```

### `deergraph-server` (Python)

```python
from deergraph.runtime import (
    RunEventSource,         # Protocol
    build_graph_snapshot,   # 核心函数
    GraphSnapshot,
)
from deergraph.server import create_router

# 仅测试用
from deergraph.testing import MemoryRunEventSource
```

## 不在本 ADR 范围

- 是否做 SSE / WebSocket 推送：ADR-005 处理（如有需要）。
- 是否发布 npm / PyPI：ADR-003 §8.4=a 维持暂不发布。
- 自定义节点 / 边渲染器扩展点：留待 Stage 5+ 设计。

## 后续工作

- Step 4b：按本 ADR 实现 L1/L2/L3，让 deergraph 仓库 `pnpm -r test` + `pytest` 全绿。由 Claude Code CLI 执行，OpenClaw 监督。
- Step 5：deer-flow 集成层切换到消费 `@deergraph/react` + `deergraph-server`，写 thin adapters（`RunEventSource` 适配 `RunEventStore`，`useResolvedRunId` 包装 `useThreadRuns`，把 `fetchWithAuth` 注入 `configureDeergraph`）。
