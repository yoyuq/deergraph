# DeerGraph 状态看板

最后更新：2026-05-31 23:03 (Asia/Shanghai)
更新者：OpenClaw (main agent)

## 阶段进度

| 阶段 | 名称 | 状态 | 备注 |
|------|------|------|------|
| 0 | 共同设计勘探与 ADR | 已完成 | OpenClaw 审查通过 |
| 1 | Graph Core Snapshot（后端只读 snapshot API） | 已完成 | 提交 `c25d93f`，OpenClaw 审查通过 |
| 2 | Task Lifecycle Enrichment（task_* 生命周期） | 暂未启动 / 后置 | MVP 已用 RunEventStore 还原图谱，本阶段非阻塞 |
| 3 | Frontend Static Graph（独立静态前端页面） | 已完成 | 提交 `c25d93f`，OpenClaw 审查通过 |
| 4 | Chat Tab Integration + Near-Realtime | 已完成 | 提交 `c49b4e1` + `e45c287`，OpenClaw 审查通过 |
| 5 | Interaction & Readability | 未开始 | UX 决策，需用户拍板 |
| 6 | Demo & Documentation | 未开始 | 需用户定面向人群与演示形式 |

## 最近提交（deer-flow 仓库）

```
e45c287 feat: integrate Agent Graph into chat page with near-realtime polling
c49b4e1 refactor(threads): allow useThreadRuns to be disabled via enabled option
c25d93f feat: add DeerGraph snapshot API and static graph view
```

## 验证基线（阶段 4 收口）

```
pnpm test       → 32 files / 226 tests passed
pnpm typecheck  → exit 0
pnpm build      → compiled successfully
                  非阻塞 warning：既有 mock route NFT 警告
```

## 当前 deer-flow 工作区状态

`git status --short`：

```
?? backend/langgraph.studio.local.json
?? backend/main.py
```

这两个是本地开发便利文件，明确不属于 DeerGraph 交付物，**不要提交**。

OpenClaw 本地工作区污染已被 `.git/info/exclude` 隐藏，不再出现。

## 仓库布局决定

- 2026-05-31 15:02 GMT+8：用户选 **C（独立仓库）**。
- 2026-05-31 15:12 GMT+8：ADR-003 执行选项拍板为 8.1=a, 8.2=b, 8.3=b, 8.4=a, 8.5=a，与默认推荐一致。
- ADR-003 进入执行阶段，OpenClaw 会按步派单给 Claude Code，每步可逆且不动 deer-flow 历史、不删 deer-flow 内代码。

## 仓库独立化进度

- 2026-05-31 Step 1：git-filter-repo 2.47 安装 + deer-flow 完整 bare 镜像 + skeleton 占位（未真过滤）。
- 2026-05-31 Step 1.5：filter-repo 真过滤验证通过（OpenClaw 复审）。
  - `deergraph-history-filtered` 仓库实测 46 个 DeerGraph 文件、2 个 commit（`bfaa310` 快照 + `b444905` 集成）。
  - 集成层零泄漏。
  - 集成层 commit `c49b4e1`（`useThreadRuns` enabled 选项）按 ADR-003 §4.3 属于待抽契约边界，永久仅在 deer-flow 仓库可追溯。
- 2026-05-31 Step 2：deergraph 仓库落地于 `C:\Users\hjl\Projects\deergraph`。
  - 物理目录由过滤副本 clone 而来，HEAD 已含 `b444905` + `bfaa310`。
  - 协调文档与 skeleton 由 OpenClaw 提交一个新 commit `ea674c0`（chore: bootstrap monorepo skeleton and coordination docs）。
  - 暂无 remote、未 push。
  - 源码暂保留在历史原路径（`backend/*`、`frontend/*`）；下一步 Step 3 才做 `packages/server`、`packages/react` 物理重组。
  - 全程未对 deer-flow 执行任何命令，HEAD 仍 `e45c287`。
  - 备份：`C:\Users\hjl\Projects\deergraph-coord-backup`。
  - 工作副本保留：`C:\Users\hjl\Projects\deergraph-work\{deer-flow.git, deergraph-history-filtered, deergraph-history-dryrun.OLD, deergraph-paths.txt}`。
- 2026-05-31 Step 3：源码物理重组（OpenClaw 代行）。
  - commit `35198d8` refactor: relocate sources into monorepo packages/server and packages/react
  - 42 文件 100% rename，未改任何文件内容。
  - 后端源码 / 测试 → packages/server/deergraph/{runtime,server,tests}。
  - 前端源码 / 测试 → packages/react/src/{core,components} 与 packages/react/tests/{core,components}。
  - 独立页面 → examples/standalone-page/page.tsx。
  - PowerShell git mv 踩坑备忘：`__init__.py` 被数组 splat 吞字；并行 exec 会撞 index.lock；必须用 workdir + 裸绳路径 串行调用。
- 2026-05-31 Step 4a：monorepo manifests + tooling（OpenClaw 代行）。
  - 写实 root `package.json`、`pnpm-workspace.yaml`、`packages/react/{package.json,tsconfig.json,vitest.config.ts}`、`packages/server/pyproject.toml`。
  - 新增 `BUILDABILITY.md`：阐明仓库当前 **结构完整但尚不可 build**，列出 L1/L2/L3 阻塞项与责任划分。
  - 新增 `discussions/2026-05-31-step4b-prompt.md`：给 Claude Code 的 Step 4b 提示词（L1 internal rename + L2 host UI fallback + L3 占位 stub）。
  - 本步 **不修改任何源码 import**；deergraph 仓库仍不可 build/test，是预期。
- 2026-05-31 用户出门，授权 OpenClaw + Claude Code 联动推进。Claude Code 本会话未上线，Step 4b/4c 等他回来后按 `discussions/2026-05-31-step4b-prompt.md` 执行。OpenClaw 不在用户不在场时独自决定 L3 契约形状。
- 2026-05-31 22:xx 用户确认 ADR-004 五个契约按 OpenClaw 推荐定型；GitHub 仓库创建并 push：`https://github.com/yoyuq/deergraph`。
  - commit `412209c` docs(adr): accept ADR-004 public API contracts。
- 2026-05-31 Step 4b：按 ADR-004 实现独立仓库契约，让 deergraph 可独立验证。
  - Claude Code 先静默执行了大量改动；OpenClaw 后续审查、补修 runtime Context 优先级契约，并跑最终验证。
  - Python：新增 `RunEventSource` Protocol、`MemoryRunEventSource`、`create_router(event_source, auth_dep, prefix)`；移除 `deerflow.*` / `app.gateway.*` 运行时依赖。
  - React：新增 `configureDeergraph` + `DeergraphProvider`、本地 `cn`、Button/ScrollArea fallback；`ChatAgentGraphPanel` 改为 `runId` only，移除 thread/useThreadRuns 依赖。
  - 验证通过：`pnpm -r typecheck` exit 0；`pnpm -r test` → 8 files / 63 tests passed；`pip install -e .[dev]` + `pytest -q` → 56 passed, 1 warning。

## 下一步候选

- **A. 阶段 5 Interaction & Readability**
  - 选中态详情抽屉打磨
  - 节点筛选 / 折叠
  - 大图谱降级渲染策略
  - 需要用户先定下交互目标
- **B. 阶段 2 Task Lifecycle Enrichment**
  - `task_*` 事件状态映射增强
  - 不是阻塞项，但有助于阶段 5 的可读性
- **C. 阶段 6 Demo & Documentation**
  - 录制演示
  - 文档结构与目标受众
  - 需要用户先定面向人群（团队内部 / 公开演示 / 上线 changelog）

OpenClaw 不在用户睡着时擅自开始阶段 5/6，只做准备工作（草稿和合规复核）。
