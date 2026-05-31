# DeerGraph ADR

本文件记录 DeerGraph 项目的关键架构决策。状态可为 Proposed / Accepted / Rejected。

> 阶段 0（2026-05-31）已对照 DeerFlow 真实代码核实各决策，详见 `docs/plans/2026-05-31-deergraph-design.md`。本轮把已被代码事实确认的决策从 Proposed 推进到 Accepted，并修正前端入口（ADR-2）与子 Agent 注入点（ADR-5）两处与代码不符的假设。

## ADR-1: 图谱 API namespace

日期：2026-05-31
状态：Accepted（阶段 0 核实，待 OpenClaw 终审）

背景：DeerFlow 已有 LangGraph 相关 API，但 DeerGraph 是产品级可视化能力，不应污染 LangGraph 兼容接口。

代码事实（阶段 0 核实）：
- 路由集中注册于 `backend/app/gateway/app.py:332-376`，前缀写在各 router 模块内。
- 当前不存在 `/api/visual` 或 `/api/langgraph` 前缀。
- 现有 run 级事件端点 `GET /api/threads/{thread_id}/runs/{run_id}/events`（`thread_runs.py:410`）已读 `RunEventStore`。
- store 经 `get_run_event_store(request)` 依赖注入；鉴权用 `@require_permission("runs","read",owner_check=True)`，需路径含 `thread_id`。

决策候选：
- A. `/api/visual/runs/{thread_id}/{run_id}/graph`（独立命名空间）
- B. `/api/threads/{thread_id}/runs/{run_id}/graph`（顺从既有嵌套约定）
- C. `/api/langgraph/threads/{thread_id}/runs/{run_id}/graph`（污染兼容层，否决）

决策：**A**。新增 `backend/app/gateway/routers/visual_runs.py`，`prefix="/api/visual"`，在 `app.py:370` 附近注册。
张力记录：A 是唯一脱离 `/api/threads/...` run 级嵌套约定的端点；保留 B 作为 OpenClaw 可推翻的替代。

## ADR-2: 前端入口

日期：2026-05-31
状态：Accepted（阶段 0 修正原假设）

背景：用户希望一边看 DeerFlow 回答，一边看运行图谱。

代码事实（阶段 0 核实，修正原计划假设）：
- `@xyflow/react@^12.10.0` 已安装（`frontend/package.json:54`）；Next.js 16 App Router、React 19。
- **聊天页没有 `Chat | Files | Agent Graph` Tab 栏**。`chat-box.tsx:104-176` 是 `ResizablePanelGroup`（`chat` 面板 + `artifacts` 侧边可调面板），artifacts 由 `artifactPanelOpen` 状态开合。
- 当前路由 `/workspace/chats/{thread_id}`，`run_id` 不在任何路由段，无 `runs/` 段。

决策候选：
- A. 只做聊天页内嵌
- B. 只做独立页面
- C. 聊天页内嵌为主 + 独立全屏路由为辅，复用组件

决策：**C**，且内嵌形态修正为：
- 独立页面新增路由 `frontend/src/app/workspace/chats/[thread_id]/runs/[run_id]/graph/page.tsx`。
- 聊天页内嵌采用 **ResizablePanel 侧栏方案（4A）**：新增第三个 `ResizablePanel id="agent-graph"`（与 artifacts 同构），**不是字面的 Tab 组件**。计划书"Agent Graph Tab"措辞按此理解。
- 否决：先把聊天区重构成 Radix Tabs 再加 Tab（4B），改动面过大，MVP 不做。

## ADR-3: 实时机制

日期：2026-05-31
状态：Accepted（阶段 0 核实）

背景：DeerFlow 已有 run 事件/SSE 基础设施，重复造 WebSocket 成本高。

代码事实（阶段 0 核实）：
- 现有 SSE 端点 `POST /api/runs/stream`（`runs.py:34`）经 `sse_consumer`（services.py:373-405）下发。
- worker 把 LangGraph 流 publish 到 StreamBridge（`worker.py:311-334`）；StreamBridge `publish/subscribe`（`stream_bridge/base.py:41-61`）支持按 id 重放。
- `task_*` 事件实时经 StreamBridge 流转，可被 SSE 订阅消费。

决策候选：
- A. 先 snapshot + polling，后复用现有 SSE/StreamBridge 生成 GraphDelta
- B. 新建 `/graph/stream` SSE
- C. 新建 WebSocket

决策：**A**。除非阶段 4 证明现有 SSE 生命周期无法满足图谱订阅，否则不新建 `/graph/stream`，不新建 WebSocket。

## ADR-4: 图布局方案

日期：2026-05-31
状态：Proposed

候选：
- React Flow 基础布局
- Dagre
- ELK

当前倾向：MVP 先用简单分层布局；节点变多后再评估 Dagre/ELK。（阶段 3 前无需冻结。）

## ADR-5: Subagent 生命周期事件来源与注入点

日期：2026-05-31
状态：Accepted（阶段 0 重大修正：不新造 `subagent.*`，复用 `task_*`）

背景：子 Agent 当前在隔离事件循环线程中运行，内部事件不自然进入 RunEventStore。

代码事实（阶段 0 核实，推翻原 A 候选）：
- `task_tool.py` 已经发出完整生命周期 custom stream：`task_started`(329)/`task_running`(353)/`task_completed`(370)/`task_failed`(377)/`task_cancelled`(384)/`task_timed_out`(391)。
- **`task_id == tool_call_id`**（`task_tool.py:316`，`InjectedToolCallId` 见 :192）。该 id 同时等于 `llm.ai.response` 中 task tool_call 的 `id` 与 `llm.tool.result` 的 `tool_call_id`——subagent 静态结构与生命周期状态用同一关联键对齐。
- subagent 在隔离守护线程循环执行（`subagents/executor.py`），内部 astream 事件不流入父 store；`task_*` 当前实时 only、不落库。

决策候选：
- A.（原案，否决）在 task 工具层新造 `subagent.spawn/finish/error` 平行事件词汇。
- B. 复用现有 `task_*` 语义；阶段 4 前端经现有 SSE 订阅 → 按 `task_id` 转 GraphDelta（`node.update` status）。
- C. 阶段 2 可选：若需刷新后回看历史状态，在 **worker 流消费段**（`worker.py`，与 RunJournal flush 同区）best-effort 旁路落库；不在 `task_tool.py` 内绕过 RunJournal 写 store。

决策：**B 为主，C 为可选增强**。不新造 `subagent.*`。任何落库/delta 失败 best-effort 吞掉记日志，不影响主任务。
（后续如必须展示 `Subagent -> Tool`，再单独评估向 SubagentExecutor 注入 event writer 的跨线程方案。）

## ADR-6: 敏感信息脱敏策略

日期：2026-05-31
状态：Accepted（阶段 0 核实）

代码事实（阶段 0 核实）：
- 仓内**不存在**任何 secret 脱敏/掩码工具；tool input/output 原文落库，snapshot 直接回显有泄露风险。
- 截断有现成约定可复用：`ToolOutputBudgetMiddleware`（head+tail + 行边界对齐）、`ToolOutputConfig`、`DbRunEventStore` 的 `content_truncated`/`original_byte_length` 元数据标志。

决策：`runtime/graph/sanitizer.py` 在写入 snapshot 前对所有预览字段执行三层处理：
1. **默认只出摘要预览**，head+tail 截断（graph 自有较小常量，如 head≈500/tail≈200，按行边界对齐），原文不进 snapshot。
2. **字段名脱敏**：键名命中 `password/secret/token/api_key/authorization/bearer/credential/private_key/session/cookie/client_secret` 等（大小写不敏感）→ 值替换为 `[REDACTED]`。
3. **值模式脱敏**：正则匹配 `Bearer …`、`sk-…`、`ghp_…`、`AKIA…`、内联 `key=value` 秘密 → `[REDACTED]`。
统一标记 `[REDACTED]`；规则做成可配置常量；sanitizer 异常 best-effort 不中断构建。
