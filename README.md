# DeerGraph — 项目协调目录

这个目录**不是**代码仓库，是 DeerGraph 项目的协调中心。

## 当前真实代码位置

DeerGraph 的实现当前仍在 deer-flow 仓库内：

```
C:\Users\hjl\Projects\deer-flow
```

实际产物分布：

- 后端 Graph Snapshot API
  - `backend/app/gateway/routers/visual_runs.py`
  - `backend/packages/harness/deerflow/runtime/graph/`
  - `backend/tests/test_graph_*.py`
  - `backend/tests/test_visual_runs_router.py`
- 前端 Static Graph + Chat 集成
  - `frontend/src/core/agent-graph/`
  - `frontend/src/components/workspace/agent-graph/`
  - `frontend/src/app/workspace/chats/[thread_id]/runs/[run_id]/graph/page.tsx`
  - `frontend/src/app/workspace/chats/[thread_id]/page.tsx`（聊天页集成点）
  - `frontend/tests/unit/core/agent-graph/`
  - `frontend/tests/unit/components/agent-graph/`
- 计划与设计文档
  - `docs/plans/2026-05-31-deergraph-*.md`
  - `docs/plans/deergraph-*.md`

## 这个目录放什么

- `README.md` — 入口（本文件）。
- `STATUS.md` — 阶段看板和当前进度。
- `discussions/` — 用户、OpenClaw（main agent）、Claude Code 三方协作的对话/交接/审查记录。
- `decisions/` — DeerGraph 自己的 ADR，比如“是否最终拆出 deer-flow 独立成仓库”。

## 这个目录不放什么

- 不放代码副本。代码 single source of truth 在 deer-flow。
- 不放重复的计划书。计划书 single source of truth 在 deer-flow 的 `docs/plans/`，这里只放对应链接和摘要。

## 为什么没有把代码物理迁出 deer-flow

简短结论：阶段 1～4 已经作为提交进入 deer-flow 的 git 历史，且阶段 4 的实现本质上是聊天页内部集成，不是松耦合的独立子系统。

详见：

- `decisions/ADR-001-repo-layout.md`
