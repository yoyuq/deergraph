# Step 4b 提示词（给 Claude Code，等他回来直接派）

OpenClaw 已经做完 Step 3（源码物理 git mv 到 monorepo）+ Step 4a（manifests + tsconfig + vitest + pyproject + BUILDABILITY 报告）。
本提示词要 Claude Code 完成 Step 4b：L1 内部 rename + L2 host UI fallback，让 deergraph 仓库能跑测试。

## 依据
- `C:\Users\hjl\Projects\deergraph\BUILDABILITY.md` — 阻塞清单与分级
- `C:\Users\hjl\Projects\deergraph\decisions\ADR-003-independent-repo-migration.md`
- 决策：8.2=b（先迁后抽契约）、8.3=b（双仓库并行）、8.4=a（暂不发布）、8.5=a（OpenClaw 主操盘 + Claude Code 执行）

## 工作目录
C:\Users\hjl\Projects\deergraph

## 绝对禁止
- 不要在 C:\Users\hjl\Projects\deer-flow\ 内运行任何命令。
- 不要 push / 不要 add remote。
- 不要改 ADR / discussions / STATUS（除非追加 Step 4b 进度，append-only）。
- L3 契约边界（RunEventSource / Auth / fetcher / config / useThreadRuns）**本步不动**。
  - 当遇到这五个引用时：在该文件附近留一个 `TODO(step-4c)` 注释和最小 stub，让 import 能解析、typecheck 能过，但**不要**实现真正的 Provider/Context API。
- 不要安装无关依赖；与 `packages/react/package.json` 已声明项一致即可。

## 任务

### A. Python — packages/server

A.1 把所有 `deerflow.runtime.graph.*` → `deergraph.runtime.*`
  涉及文件：
    - deergraph/runtime/__init__.py
    - deergraph/runtime/builder.py
    - deergraph/runtime/event_mapper.py
    - deergraph/server/router.py
    - tests/test_graph_builder.py
    - tests/test_graph_event_mapper.py
    - tests/test_graph_sanitizer.py
    - tests/test_visual_runs_router.py

A.2 router.py 外部依赖处理（最小 stub）
  - `from app.gateway.authz import require_permission` →
    在 deergraph/server/_contracts.py 新建一个 minimal 占位：
      def require_permission(name: str):  # TODO(step-4c): real auth dep
          def _dep():
              return None
          return _dep
  - `from app.gateway.deps import get_run_event_store` →
    同样占位：
      def get_run_event_store():  # TODO(step-4c): real event source contract
          raise NotImplementedError("RunEventSource must be injected by host (Step 4c)")
  router.py 改成 `from ._contracts import require_permission, get_run_event_store`。

A.3 测试辅助
  - tests/_helpers.py 复制原 deer-flow `_router_auth_helpers` 的 make_authed_test_app 实现。
    如果原文件已被移出 deer-flow 视野，按 router.py 当前 dep 接口写一个最小 FastAPI app fixture，足以让 TestClient 通过 require_permission。
  - tests/conftest.py 添加 `sys.path` 注入或直接用 `from ._helpers import ...` 的相对 import。

A.4 测试用的 MemoryRunEventStore
  - 新建 deergraph/testing/__init__.py 暴露 MemoryRunEventStore（in-memory 实现，足以让 builder.py 与 router.py 测试运行）。
  - tests/test_graph_builder.py 与 tests/test_visual_runs_router.py 改为 `from deergraph.testing import MemoryRunEventStore`。

A.5 运行验证
  cd packages/server
  python -m venv .venv
  .\.venv\Scripts\python -m pip install -e .[dev]
  .\.venv\Scripts\python -m pytest -q
  期望：全绿（保留原 113 + 215 + 216 + 180 个用例数量，或按 rename 后实际数量记录）。

### B. TypeScript — packages/react

B.1 本地 cn 实现
  - 新建 src/lib/cn.ts:
      import clsx, { type ClassValue } from "clsx";
      import { twMerge } from "tailwind-merge";
      export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
  - 把所有 `from "@/lib/utils"` 改为 `from "@/lib/cn"`（路径 alias 已配好 `@/* = src/*`）。

B.2 UI fallback
  - 新建 src/components/ui/button.tsx 与 src/components/ui/scroll-area.tsx，最小 unstyled 实现：
      // button.tsx
      import * as React from "react";
      import { cn } from "@/lib/cn";
      export const Button = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button">>(
        function Button({ className, ...props }, ref) {
          return <button ref={ref} className={cn("dg-button", className)} {...props} />;
        }
      );
      // scroll-area.tsx
      import * as React from "react";
      import { cn } from "@/lib/cn";
      export function ScrollArea({ className, ...props }: React.ComponentProps<"div">) {
        return <div className={cn("dg-scroll-area", className)} style={{ overflow: "auto" }} {...props} />;
      }
  - 保留 `@/components/ui/{button,scroll-area}` 路径不变，源文件无需改 import。

B.3 L3 占位（不实现真契约）
  - src/core/agent-graph/api.ts 中 `fetchWithAuth` 与 `getBackendBaseURL`：
    新建 src/core/runtime-config.ts：
      export interface DeergraphRuntimeConfig {
        fetcher?: typeof fetch;
        baseUrl?: string;
      }
      let _cfg: DeergraphRuntimeConfig = {};
      export function configureDeergraph(c: DeergraphRuntimeConfig) { _cfg = { ..._cfg, ...c }; }
      export function getFetcher() { return _cfg.fetcher ?? globalThis.fetch.bind(globalThis); }
      export function getBaseUrl() { return _cfg.baseUrl ?? ""; }
    api.ts 改为：
      import { getFetcher, getBaseUrl } from "@/core/runtime-config";
      // ...
      const fetchWithAuth = getFetcher();
      const base = getBaseUrl();
    并在 src/index.ts 重新导出 `configureDeergraph`。

  - src/core/agent-graph/use-resolved-run-id.ts 中 `useThreadRuns`：
    新建 src/core/threads-port.ts：
      import * as React from "react";
      export interface ThreadRun { id: string; ... }  // 与原 deer-flow 同形状即可
      export interface ThreadsPort {
        useThreadRuns: (
          threadId?: string,
          opts?: { enabled?: boolean }
        ) => { data?: ThreadRun[]; isLoading: boolean };
      }
      const defaultPort: ThreadsPort = {
        useThreadRuns: () => ({ data: [], isLoading: false }),  // TODO(step-4c)
      };
      const Ctx = React.createContext<ThreadsPort>(defaultPort);
      export const ThreadsPortProvider = Ctx.Provider;
      export const useThreadsPort = () => React.useContext(Ctx);
    use-resolved-run-id.ts 改为：
      const { useThreadRuns } = useThreadsPort();
      const { data } = useThreadRuns(threadId, { enabled: !activeRunId });
    在 src/index.ts 暴露 `ThreadsPortProvider`。

B.4 测试
  - tests/core 与 tests/components 已被 git mv 到位。
  - vitest.config.ts 已配。
  - 跑 `pnpm install`（注意 deergraph 仓库根用 pnpm，不要用 npm/yarn）。
  - 跑 `pnpm -r typecheck` 与 `pnpm -r test`。
  - 测试里若引用 `@/core/threads/hooks` 的 mock，请改为 mock `@/core/threads-port` 的 `useThreadsPort` 返回值。

### C. 运行总验证

C.1 deergraph 自洽测试
  - cd C:\Users\hjl\Projects\deergraph
  - pnpm install        → 成功
  - pnpm -r typecheck   → 干净
  - pnpm -r test        → 全绿
  - cd packages\server
  - python -m venv .venv && .\.venv\Scripts\python -m pip install -e .[dev]
  - .\.venv\Scripts\python -m pytest -q  → 全绿

C.2 提交（OpenClaw 决定 commit message，本步先 stage 让 OpenClaw 审）
  - 不要自己执行 git commit。准备好工作树，git status --short 给 OpenClaw 看，由 OpenClaw 决定切几个 commit。
  - 不要 push / 不要 add remote。

C.3 deer-flow 验证
  - 一句话确认：deer-flow HEAD 仍 e45c287，git status --short 仍只有两个 untracked。

### D. 必须输出的报告

1. 全部上面 A/B/C 的关键命令原始输出（pnpm install 摘要、pytest 摘要、typecheck 输出）。
2. 改动文件清单（git status --short）。
3. 任何 TODO(step-4c) 标记的位置一览。
4. L3 契约边界**没有触碰**的明确声明。
5. 一句话：deer-flow 未被触碰，HEAD 仍 e45c287。

完成后停止，等 OpenClaw 审查后再决定 commit 与 message。
