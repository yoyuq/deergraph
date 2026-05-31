# ADR-003 DeerGraph 独立仓库迁移方案（草案）

- 状态：Accepted（用户 2026-05-31 15:12 GMT+8 拍板 8.1=a, 8.2=b, 8.3=b, 8.4=a, 8.5=a）
- 日期：2026-05-31
- 上游决策：ADR-001 用户选 C（独立仓库）

## 1. 目标

把 DeerGraph 从 deer-flow 拆出，落地在：

```
C:\Users\hjl\Projects\deergraph\
```

独立成自有 git 仓库 + 自有版本号 + 自有发布流程；deer-flow 内只保留**集成层薄壳**（ChatPage 集成、路由注册），其余实现从 deergraph 仓库消费。

## 2. 范围划分（哪些进 deergraph，哪些留 deer-flow）

### 进 deergraph 仓库

**Backend / Python**
- `backend/packages/harness/deerflow/runtime/graph/`
- `backend/app/gateway/routers/visual_runs.py` → 重命名为 `deergraph/server/router.py`
- `backend/tests/test_graph_builder.py`
- `backend/tests/test_graph_event_mapper.py`
- `backend/tests/test_graph_sanitizer.py`
- `backend/tests/test_visual_runs_router.py`

**Frontend / TypeScript**
- `frontend/src/core/agent-graph/`
- `frontend/src/components/workspace/agent-graph/`
- `frontend/src/app/workspace/chats/[thread_id]/runs/[run_id]/graph/page.tsx` → 独立 demo 页 / examples
- `frontend/tests/unit/core/agent-graph/`
- `frontend/tests/unit/components/agent-graph/`

**Docs**
- `docs/plans/2026-05-31-deergraph-*.md`
- `docs/plans/deergraph-*.md`

### 留在 deer-flow 仓库

- `backend/app/gateway/app.py`（router 注册点）
- `backend/app/gateway/routers/__init__.py`（router 导出点）
- `frontend/src/app/workspace/chats/[thread_id]/page.tsx`（ChatPage 集成，引用 `@deergraph/react` 的 `ChatAgentGraphPanel`）
- `frontend/src/core/threads/hooks.ts` 的 `useThreadRuns({ enabled })` 改动留在 deer-flow（公共 hook）
- 文档保留指向 deergraph 仓库的链接

## 3. 拓扑结构

```
deergraph/
├─ packages/
│  ├─ server/                # Python: graph runtime + FastAPI router
│  │  ├─ pyproject.toml
│  │  ├─ deergraph/
│  │  │  ├─ runtime/
│  │  │  │  ├─ models.py
│  │  │  │  ├─ sanitizer.py
│  │  │  │  ├─ event_mapper.py
│  │  │  │  └─ builder.py
│  │  │  └─ server/
│  │  │     └─ router.py     # 由 deer-flow 注册到 /api/visual
│  │  └─ tests/
│  └─ react/                 # TypeScript: 前端 UI + hooks
│     ├─ package.json
│     ├─ src/
│     │  ├─ core/            # types/api/layout/visuals/hooks/run-id/use-resolved-run-id
│     │  └─ components/      # AgentGraphView/Canvas/Node/Details/States/ChatAgentGraphPanel
│     └─ tests/
├─ examples/
│  └─ standalone-page/       # 阶段 3 独立页面的范例
├─ docs/
│  └─ plans/                 # 计划/审查/讨论文档
├─ decisions/                # ADR
├─ discussions/              # 协作记录
├─ STATUS.md
└─ README.md
```

## 4. 契约边界（这是 C 方案最关键的工作）

DeerGraph 必须不再 import deer-flow 的内部模块。需要抽象出三个契约：

### 4.1 RunEventStore 适配器（Python）

deergraph/runtime/builder.py 不应直接 import `harness.deerflow.runtime.run_event_store`。
定义协议：

```python
class RunEventSource(Protocol):
    async def list_events(self, thread_id: str, run_id: str) -> list[RunEvent]: ...
```

deer-flow 在 `app.py` 注册时实现这个 Protocol，注入到 router。

### 4.2 Auth / Identity 适配器（Python）

`router.py` 当前可能依赖 deer-flow 的鉴权依赖（FastAPI Depends）。
要把 auth dependency 改成由 deer-flow 在注册 router 时通过 factory 注入：

```python
def make_router(get_user: AuthDep, events: RunEventSource) -> APIRouter: ...
```

### 4.3 前端 API client 边界（TS）

`@deergraph/react` 内部的 `fetchAgentGraph` 不能继续 import deer-flow 的 `fetchWithAuth`。
改为构造函数注入或运行时配置：

```ts
configureDeergraph({ fetcher: fetchWithAuth })
```

deer-flow 在应用启动时调用 `configureDeergraph(...)`。

## 5. 历史迁移策略

两种可选：

### 选项 1：保留历史（git-filter-repo）

- 用 `git-filter-repo --path ...` 把 deer-flow 中 DeerGraph 路径抽成新仓库。
- 优点：保留 `c25d93f` / `c49b4e1` / `e45c287` 等提交的作者、日期、message。
- 缺点：filter-repo 会重写历史；新仓库要重新 push；后续 deer-flow 删除这些路径时要小心保留集成层。

需要安装：

```
pip install git-filter-repo
```

### 选项 2：放弃历史，从干净仓库起步

- `git init` 新仓库，直接 copy 文件，作为 initial commit。
- 优点：简单；不踩 filter-repo 边角。
- 缺点：丢失 commit 历史；以后追溯需要回看 deer-flow。

OpenClaw 推荐：**选项 1**（保留历史），因为阶段 0~4 讨论密度很高，历史本身就是项目记忆。

## 6. 迁移步骤（高层）

1. **Freeze**：暂停 DeerGraph 阶段 5/6 开发。
2. **新仓库准备**：在 `C:\Users\hjl\Projects\deergraph\` 准备 monorepo skeleton（pnpm + workspace + uv/pip）。
3. **历史抽取**：用 git-filter-repo 从 deer-flow 克隆出 DeerGraph 路径，作为 deergraph 初始内容。
4. **契约边界改造**：实现 §4 的三个适配器，让 deergraph 不再 import deer-flow。
5. **deergraph 自测**：deergraph 单独跑 backend tests + frontend tests + build。
6. **deer-flow 改造**：
   - 替换为消费 `@deergraph/react` 与 `deergraph-server`。
   - 删除原路径下的代码（保留集成层薄壳）。
   - 添加依赖声明（pyproject、package.json）。
   - 验证 deer-flow 全套测试仍绿。
7. **双仓库同步发布**：deergraph v0.1.0 + deer-flow 引用。
8. **文档收口**：deergraph README、deer-flow 集成指南。

## 7. 风险

- 契约边界没抽干净 → deergraph 仍隐式依赖 deer-flow 内部模块 → 后患无穷。
- pyproject / package.json 互引在 Windows 路径下容易踩坑（特别是 pnpm workspace + file: 协议）。
- 双仓库同步：deer-flow 已经 release / 被外部 fork（DeerFlow 是公开项目），破坏式拆分需要顾及上游。
- 阶段 4 集成依赖的 ChatPage / useThreadChat 在 deer-flow 内仍持续演进，deergraph 的 `ChatAgentGraphPanel` 需要 stable 适配点。

## 8. 用户拍板结果

2026-05-31 15:12 GMT+8：

- **8.1 历史策略 = a**：保留 git 历史，使用 `git-filter-repo` 抽取。
- **8.2 契约边界顺序 = b**：先按当前结构迁仓库，跑通后再抽 Protocol 契约。
- **8.3 deer-flow 清理时机 = b**：双仓库并行一段时间，deergraph 稳定后再删 deer-flow 内拷贝。
- **8.4 发布通道 = a**：暂时只本地 / pnpm workspace + file:。
- **8.5 执行分工 = a**：OpenClaw 主操盘 + Claude Code 执行单步任务。

OpenClaw 推荐默认与用户选择完全一致。
