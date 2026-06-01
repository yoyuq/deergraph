# Step 6: Demo & Documentation — Claude Code Task Brief

> OpenClaw → Claude Code 派单，2026-06-01

## 背景

DeerGraph 独立仓库已完成 Step 1-5：
- Step 0: 设计勘探 + ADR ✅
- Step 1: Graph Core Snapshot API ✅
- Step 2: Task Lifecycle Enrichment（后置，非阻塞）⏭️
- Step 3: Frontend Static Graph ✅
- Step 4: Chat Tab Integration + Near-Realtime ✅
- Step 4a/4b: 独立仓库契约（ADR-004）✅
- Step 5: deer-flow 消费 standalone deergraph 包 ✅

现在进入 **Step 6: Demo & Documentation**。

## 目标

形成可交付的演示材料和项目文档，让新用户/开发者能理解 DeerGraph 是什么、怎么用、怎么集成。

## 成品清单

### 1. `docs/deergraph.md` — 项目主文档
- DeerGraph 是什么（一段话 + 产品截图/Mockup）
- 架构图（后端 snapshot → API → 前端 React Flow）
- 快速开始：独立包安装 + 最小示例
- 与 deer-flow 集成指南（后端 RunEventSource 适配 + 前端 configureDeergraph）
- API 参考：`/api/visual/runs/{thread_id}/{run_id}/graph`
- React 组件 API：`ChatAgentGraphPanel`、`configureDeergraph`、`DeergraphProvider`
- 配置项：`refetchIntervalMs`、`baseUrl`

### 2. `docs/demo/deergraph-demo.md` — 演示说明
- 演示前提：DeerFlow 运行中 + 已安装 deergraph 包
- 推荐演示 prompt（必须触发 ≥2 个 subagent 的任务）
- 预期图谱形态说明（User → Lead Agent → Subagent × N → Lead Agent → Final）
- 截图/GIF 预留位（OpenClaw 后续补充）

### 3. `docs/demo/deergraph-prompts.md` — 推荐 prompt 集合
- 中文/英文各 3-5 个能触发多 subagent 的 prompt
- 每个 prompt 标注预期 subagent 数量和类型
- 从简单到复杂排列

### 4. `examples/demo_snapshot.py` — 最小 Python demo
- 用 `MemoryRunEventSource` 构造一个有 2 个 subagent 的模拟事件流
- 调用 `build_graph_snapshot()` 并打印结果 JSON
- 可直接 `python examples/demo_snapshot.py` 运行，无需 deer-flow

### 5. `examples/demo_standalone.html` — 浏览器内独立 demo 页面
- 基于现有 `examples/standalone-page/page.tsx`
- 嵌入 mock snapshot 数据，纯静态打开即可看到图谱
- 不需要后端

## 约束

1. **不写功能代码**：Step 6 只写文档 + demo 示例 + mock 数据，不改动 `packages/server` 或 `packages/react` 的源码。
2. **不 touch deer-flow 仓库**：所有改动只在 `C:\Users\hjl\Projects\deergraph` 内。
3. **演示数据必须真实合理**：mock 事件要符合 RunEventStore 的真实格式（seq, thread_id, run_id, event_kind, data），不能是摆拍。
4. **不要 git commit / git push**：只写文件，OpenClaw 审查后统一提交。
5. **不泄露敏感信息**：文档中不能出现 API key、token、密码。
6. **面向受众**：开发者 + 技术决策者，不需要面向最终消费者。
7. **用英文写文档**：代码注释英文，文档正文英文，prompt 示例可以中英双语。

## 验收标准

- [ ] `docs/deergraph.md` 完整覆盖架构/快速开始/API 参考
- [ ] `docs/demo/deergraph-demo.md` 有清晰的演示步骤和预期图谱形态
- [ ] `docs/demo/deergraph-prompts.md` 有 ≥6 个推荐 prompt
- [ ] `examples/demo_snapshot.py` 可以独立运行并输出有效 JSON
- [ ] `examples/demo_standalone.html` 浏览器打开可看到图谱节点和边
- [ ] `pnpm -r typecheck` 仍然通过
- [ ] `pnpm -r test` 仍然通过
- [ ] `python -m pytest packages/server -q` 仍然通过

## 执行

请在 `C:\Users\hjl\Projects\deergraph` 工作目录执行。完成后列出：
1. 实际改动文件列表
2. 关键设计决策
3. 运行结果（test / typecheck）
4. 已知问题
5. 需要 OpenClaw/用户确认的问题
