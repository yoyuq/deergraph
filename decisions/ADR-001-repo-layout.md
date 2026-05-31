# ADR-001 DeerGraph 仓库布局

- 状态：Accepted（用户 2026-05-31 15:02 GMT+8 选 C）
- 后续：见 `ADR-003-independent-repo-migration.md`
- 日期：2026-05-31
- 提案者：OpenClaw (main agent)

## 背景

用户在 2026-05-31 凌晨给出指示，要求把 DeerGraph 从 deer-flow 仓库移出，单独放在 `C:\Users\hjl\Projects` 下。

但当时的客观状态是：

1. 阶段 1～3 已经作为提交 `c25d93f` 落入 deer-flow git 历史。
2. 阶段 4 当前正在 deer-flow 上完成，git index 已 staged 公共 hook `frontend/src/core/threads/hooks.ts`。
3. 阶段 4 设计本质是聊天页内部集成（ChatPage、useThreadChat、useThreadRuns、ChatBox），不是松耦合子系统。
4. 后端 snapshot API 复用 deer-flow 的 `RunEventStore` 与 `Gateway` 路由注册机制，不易拆出。

OpenClaw 判定：在用户已就寝的情况下做整仓搬迁属于不可恢复的大动作，存在风险，因此暂不执行物理迁移，只先建立项目协调目录，把决策留给用户。

## 决策

DeerGraph 的“项目协调中心”落在：

```
C:\Users\hjl\Projects\deergraph\
```

但**代码仍留在 deer-flow 仓库内**，直到用户在以下三个方案中拍板：

### 方案 A — 维持 deer-flow 内集成（默认）

- 优点：零迁移成本；契合 Stage 4 实际耦合度；后端契约与前端 ChatPage 紧密协作天然在同仓更高效。
- 缺点：DeerGraph 作为一个有独立生命周期的功能不易单独发布或被外部复用。
- 协调中心：仍是 `C:\Users\hjl\Projects\deergraph\`，但内容仅为文档与讨论。

### 方案 B — 抽成 deer-flow 内子包

- 路径示例：
  - `backend/packages/deergraph/`（迁入 `runtime/graph` 与 `gateway/routers/visual_runs`）
  - `frontend/src/features/deergraph/`（迁入 `core/agent-graph` 与 `components/workspace/agent-graph`）
- 优点：仍在同仓，但模块边界清晰；为将来拆仓做缓冲。
- 缺点：需要一次较大重构 + 大量 import 路径修改；对 git blame 友好度受影响。

### 方案 C — 拆成独立仓库 `deergraph`

- 路径：`C:\Users\hjl\Projects\deergraph\`
- 优点：独立发布与版本号；DeerGraph 可面向其它 LangGraph 工程复用。
- 缺点：
  - 需要把 deer-flow 当前依赖（`RunEventStore` 等）抽象成稳定契约。
  - 前后端要分别拆，并维护包发布流程。
  - 现有阶段 1～4 提交需要 git-filter-repo 等方式迁移历史，成本最高。
  - 阶段 4 的 ChatPage 集成必须留在 deer-flow，独立仓库只能提供库 + 文档 + 集成示例。

## 推荐

OpenClaw 推荐顺序：A → B → C。

- 短期（阶段 5 / 6）：方案 A。
- 中期（阶段 5 完成后）：评估方案 B。
- 长期（社区/外部复用诉求出现）：评估方案 C。

## 待用户决策

- 选 A：本 ADR 标记 Accepted，DeerGraph 协调中心继续仅放文档。
- 选 B：开新 ADR-002 规划子包结构与迁移步骤。
- 选 C：开新 ADR-003 规划独立仓库的契约边界 + 历史迁移方案。
