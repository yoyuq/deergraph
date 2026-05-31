# Claude Code 执行任务：Step 4b — 实现 ADR-004 契约，让 deergraph 独立仓库可测试

你是 Claude Code，在 `C:\Users\hjl\Projects\deergraph` 仓库执行。OpenClaw 负责最终审查、commit、push。

## 背景

DeerGraph 已从 deer-flow 抽为独立仓库：

- GitHub: https://github.com/yoyuq/deergraph
- 当前 HEAD: `412209c docs(adr): accept ADR-004 public API contracts`
- Step 3 已完成物理迁移到 monorepo；Step 4a 已完成 manifests / tsconfig / pyproject / BUILDABILITY。
- 当前源码仍保留迁移前 import，因此 deergraph 暂不可独立 build/test。

## 必读文件

- `BUILDABILITY.md`
- `decisions/ADR-003-independent-repo-migration.md`
- `decisions/ADR-004-public-api-contracts.md`
- `STATUS.md`

## 绝对禁止

- **不要访问 / 修改 / 执行任何 `C:\Users\hjl\Projects\deer-flow` 命令**。
- 不要 push。
- 不要 add remote。
- 不要改 GitHub 设置。
- 不要引入 SSE / WebSocket / GraphDelta / polling 新机制。
- 不要新增平行 `subagent.*` 事件体系。
- 不要持久化 `task_*`。
- 不要改历史迁移策略 ADR。
- 不要做 Stage 5/6 产品功能。
- 不要提交 commit；完成后只输出状态，OpenClaw 审查后 commit。

## 总目标

实现 ADR-004 的公共 API 契约，让 deergraph 仓库能独立安装、typecheck、test：

```powershell
cd C:\Users\hjl\Projects\deergraph
pnpm install
pnpm -r typecheck
pnpm -r test
cd packages\server
python -m venv .venv
.\.venv\Scripts\python -m pip install -e .[dev]
.\.venv\Scripts\python -m pytest -q
```

如果环境原因导致无法完整跑完某条命令，要说明原因并尽量跑等价最小验证。

---

# 任务 A — Python server package

## A1. Internal import rename

把所有 Python 中旧 deer-flow graph import 改成 deergraph 包内 import：

- `deerflow.runtime.graph.*` → `deergraph.runtime.*`
- `app.gateway.routers.visual_runs` → `deergraph.server.router` 或直接 import `create_router`

重点文件：

- `packages/server/deergraph/runtime/__init__.py`
- `packages/server/deergraph/runtime/builder.py`
- `packages/server/deergraph/runtime/event_mapper.py`
- `packages/server/deergraph/server/router.py`
- `packages/server/tests/*.py`

## A2. 实现 RunEventSource Protocol

按 ADR-004 创建：

```python
# packages/server/deergraph/runtime/ports.py
from typing import Protocol, Sequence
from .models import RunEvent

class RunEventSource(Protocol):
    def list_events(self, run_id: str) -> Sequence[RunEvent]: ...
```

然后 `builder.py` 改为依赖 `RunEventSource`，不要 import deer-flow 的 `RunEventStore`。

若现有 builder API 还需要 `thread_id`，允许保留兼容参数，但契约主体必须是 `run_id` 导向；不要引用 deer-flow 类型。

## A3. 实现 FastAPI create_router 工厂

改 `packages/server/deergraph/server/router.py`：

```python
def create_router(
    *,
    event_source: RunEventSource,
    auth_dep: Callable[..., object] = _noop_auth,
    prefix: str = "",
) -> APIRouter: ...
```

要求：

- 不再 import `app.gateway.authz`。
- 不再 import `app.gateway.deps`。
- 默认 auth_dep 是 noop。
- 路由应暴露 snapshot endpoint。
- 如果当前测试/前端仍使用 `/api/visual/runs/{thread_id}/{run_id}/graph`，可保持兼容 endpoint；但核心构造必须通过 `event_source` 注入。
- 如果 ADR-004 新路径 `/visual/runs/{run_id}/graph` 与旧路径冲突，优先兼容旧路径 + 新增新路径，不要破坏已有测试。

## A4. 测试用 MemoryRunEventSource

新增：

```text
packages/server/deergraph/testing/__init__.py
```

提供 `MemoryRunEventSource`，足以支持 builder/router 单测。不要从 deer-flow 导入 `MemoryRunEventStore`。

## A5. 修 tests

- 修所有 import。
- 如果需要，新增 `packages/server/tests/conftest.py` 或 helper。
- 保持测试覆盖原 builder/event_mapper/sanitizer/router 行为。
- 不要为了过测试删除核心断言。

---

# 任务 B — React package

## B1. 本地 cn

新增：

```text
packages/react/src/lib/cn.ts
```

实现：

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

修所有 `@/lib/utils` import。

## B2. UI fallback

新增：

```text
packages/react/src/components/ui/button.tsx
packages/react/src/components/ui/scroll-area.tsx
```

最小 unstyled/fallback 组件即可，保持测试能跑。

## B3. 实现 runtime config 契约

按 ADR-004 实现：

```text
packages/react/src/runtime-config.tsx 或 src/core/runtime-config.tsx
```

导出：

```ts
export interface DeergraphRuntimeConfig {
  fetcher?: typeof fetch;
  baseUrl?: string;
}

export function configureDeergraph(cfg: DeergraphRuntimeConfig): void;
export function DeergraphProvider(props: { value: DeergraphRuntimeConfig; children: React.ReactNode }): JSX.Element;
export function useDeergraphRuntime(): { fetcher: typeof fetch; baseUrl: string };
```

优先级：Context value > global config > defaults。

默认：

- fetcher = `globalThis.fetch.bind(globalThis)`
- baseUrl = `""`

修 `packages/react/src/core/agent-graph/api.ts`：

- 不再 import `@/core/api/fetcher`
- 不再 import `@/core/config`
- 改为使用 runtime config。

如果 `api.ts` 不是 React hook 环境，不能直接调用 hook；请用无 hook helper，例如：

- `getDeergraphRuntime()` 用于非 React API 函数；
- `useDeergraphRuntime()` 用于组件。

两者都应尊重 global config；Context 只能在 React hook 环境内使用。

## B4. 移除 deergraph 内部 thread 概念

ADR-004 决定：deergraph 不承担 thread→run 解析。

要求：

- `ChatAgentGraphPanel` 对外 props 改为接收 `runId: string | null`。
- 不再 import `@/core/threads/hooks`。
- `use-resolved-run-id.ts` 从生产路径移除，或仅转移为 example/test helper；不得被 `ChatAgentGraphPanel` 使用。
- tests 相应改成传 runId。

建议 public props：

```ts
export interface ChatAgentGraphPanelProps {
  runId: string | null;
  open: boolean;
  onClose: () => void;
  className?: string;
}
```

如果原组件还有 threadId / activeRunId，改测试和组件为 runId-only。不要保留旧 deer-flow coupling。

## B5. Public exports

新增或修：

```text
packages/react/src/index.ts
packages/react/src/components/agent-graph/index.ts
packages/react/src/core/agent-graph/index.ts
```

确保能导出：

- `configureDeergraph`
- `DeergraphProvider`
- `AgentGraphView`
- `ChatAgentGraphPanel`
- graph types
- runtime config types

按 package.json exports 对齐。

## B6. 修 tests

- 修 vitest import。
- 测试不再 mock `@/core/threads/hooks`。
- 测试应直接传 `runId` 或 mock runtime fetcher。

---

# 任务 C — 验证

请尽可能执行：

```powershell
cd C:\Users\hjl\Projects\deergraph
pnpm install
pnpm -r typecheck
pnpm -r test
cd packages\server
python -m venv .venv
.\.venv\Scripts\python -m pip install -e .[dev]
.\.venv\Scripts\python -m pytest -q
```

如果首次失败，按 TDD/系统调试原则修复到通过。不要跳过失败。

---

# 完成报告

结束时输出：

1. 改动摘要。
2. `git status --short`。
3. 验证命令和结果。
4. 是否还有 TODO / 已知问题。
5. 明确声明：没有访问或修改 deer-flow。

停止，不要 commit，不要 push。
