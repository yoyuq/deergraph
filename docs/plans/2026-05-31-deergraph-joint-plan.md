# DeerGraph 共同计划书

> 本计划书由 OpenClaw 与 Claude Code 围绕 DeerGraph 项目进行多轮讨论后形成。它不是“两个计划书的合并”，而是双方基于 DeerFlow 真实代码事实、关键分歧讨论、阶段边界和实现风险达成的共同方案。

**项目名称：** DeerGraph  
**中文名：** DeerFlow 多智能体运行图谱  
**英文描述：** A visual runtime graph for DeerFlow multi-agent execution.  
**基座项目：** `C:\Users\hjl\Projects\deer-flow`  
**目标：** 在 DeerFlow Web UI 内，把一次任务执行中的 User、Lead Agent、Subagent、Tool、Final Answer 等元素绘制成节点/边图谱，让用户以类似知识图谱/数据结构图的方式理解多 Agent 如何分解任务、派发子任务、调用工具并汇总结果。  
**产品方向：** 类似“腾讯马威斯”式的图形化多 Agent 运行视图，而不是 Langfuse/LangSmith trace 表格。

---

## 1. 共同讨论后确认的关键事实

### 1.1 DeerGraph 必须基于真实 DeerFlow runtime

DeerGraph 不是 mock demo，不是单独摆拍的 React Flow 页面。所有节点和边必须来自 DeerFlow 实际运行过程中的事件、消息、tool call、run 状态或 stream 事件。

### 1.2 MVP 所需最小图谱可以由现有持久化事件还原

Claude Code 核查代码后确认：MVP 所需的最小链路：

```text
User -> Lead Agent -> Subagent -> Lead Agent -> Final
```

可以先由现有 `RunEventStore` 中已持久化的事件还原，不一定要先新增 subagent lifecycle 事件。

可用事件包括：

| 图谱元素 | 可用来源 |
|---|---|
| User 节点 | `llm.human.input` |
| Lead Agent 节点 | `llm.ai.response` / run metadata / caller 信息 |
| Lead -> Subagent 委派边 | `llm.ai.response` 中的 `task` tool_call |
| Subagent 节点 | `task` tool_call，`tool_call_id` 可作为 task/subagent correlation id |
| Subagent -> Lead 返回边 | `llm.tool.result`，按 `tool_call_id` 与前面的 task tool_call 配对 |
| Final 节点 | `run.end` + 最后一条 lead agent AIMessage |

这意味着：

> 阶段 1 就能交付一个真实、非 mock 的静态 MVP 图谱。

### 1.3 现有 `task_*` 生命周期事件在实时流里，但当前不落库

Claude Code 核查后确认：`task` 工具当前已经通过 `get_stream_writer()` 发出类似以下 custom 流事件：

```text
task_started
task_running
task_completed
task_failed
task_cancelled
task_timed_out
```

这些事件进入父 run 的 LangGraph custom stream，可被 StreamBridge / SSE 实时消费。

但 `RunJournal` 是 callback handler，主要消费 LangChain/LangGraph callback，如：

```text
run.start
run.end
run.error
llm.human.input
llm.ai.response
llm.tool.result
```

它当前不负责消费 custom stream，所以 `task_*` 生命周期事件当前不能假定已经持久化到 `RunEventStore`。

### 1.4 不应另造 `subagent.*` 事件词汇表

初版计划曾建议新增：

```text
subagent.spawn
subagent.start
subagent.finish
subagent.error
```

经过讨论后，双方共识是：

> 不应重复发明一套平行事件词汇。应优先复用现有 `task_*` 事件语义。

也就是说，阶段 2 的目标不是“另起炉灶发 subagent.*”，而是：

```text
让现有 task_started/task_running/task_completed/task_failed/task_cancelled/task_timed_out 能被图谱系统稳定消费，必要时持久化或转为 GraphDelta。
```

### 1.5 `seq` 由 RunEventStore 分配，未确认存在 emitter.py bug

讨论过程中 Claude Code 曾一度提到 `emitter.py seq bug`，但后续双方复核发现：

- 项目源码中没有定位到相关 `emitter.py`。
- `RunEventStore` 契约说明 seq 在同一 thread 内严格递增。
- `JsonlRunEventStore` / `MemoryRunEventStore` 都由 store 按 `thread_id` 分配 seq。

因此：

> `emitter.py seq bug` 不作为已确认风险写入计划。若后续阶段 0 再发现真实问题，再记录到 ADR。

### 1.6 Graph 写入/持久化失败不得影响主任务

DeerGraph 是旁路观测能力。任何图谱事件写入、GraphDelta 构建、snapshot 生成、UI 渲染失败，都不能中断 DeerFlow 正常对话、agent 执行或工具调用。

---

## 2. 产品目标

### 2.1 用户目标

用户应能在 DeerFlow Web UI 中看见：

- 当前任务从 User 到 Lead Agent 的入口。
- Lead Agent 是否调用了 task/subagent。
- 每个 subagent 的任务摘要、状态和结果摘要。
- subagent 结果如何回流给 Lead Agent。
- 最终答案如何产生。
- 后续增强中，可进一步看到工具调用、耗时、失败、重试、token/模型摘要等。

### 2.2 开发者目标

开发者应能用 DeerGraph 判断：

- subagent 是否真的被触发。
- task tool_call 与 tool_result 是否正确配对。
- 哪些 subagent 执行失败或超时。
- run 的事件是否完整。
- 多 Agent 调度是否符合预期。

---

## 3. 非目标

MVP 不做：

- 不做 Agent 工作流拖拽编排。
- 不做用户手动设计 Agent 图。
- 不替代 Langfuse/LangSmith。
- 不替代 LangGraph Studio。
- 不做跨任务长期知识图谱沉淀。
- 不默认展示完整 prompt/tool input/tool output。
- 不创建一键启动脚本。
- 不改变 DeerFlow agent 的核心推理逻辑。
- 不强制展开 subagent 内部工具调用。

---

## 4. 最小可交付 MVP

MVP 必须做到：

```text
User -> Lead Agent -> Subagent -> Lead Agent -> Final
```

### 4.1 MVP 节点

| 节点 | 来源 | 必须性 |
|---|---|---|
| User | `llm.human.input` | 必须 |
| Lead Agent | `llm.ai.response` / run metadata | 必须 |
| Subagent | `task` tool_call | 必须 |
| Final | `run.end` + final AIMessage | 必须 |
| Tool | 普通 tool_call/tool_result | 可选，MVP 可折叠或暂不展开 |

### 4.2 MVP 边

| 边 | 来源 | 必须性 |
|---|---|---|
| User -> Lead Agent | human input | 必须 |
| Lead Agent -> Subagent | `task` tool_call | 必须 |
| Subagent -> Lead Agent | `llm.tool.result` paired by `tool_call_id` | 必须 |
| Lead Agent -> Final | final AIMessage / run.end | 必须 |

### 4.3 MVP 不强制实时

MVP 可以先做静态 snapshot：

```text
GET /api/visual/runs/{thread_id}/{run_id}/graph
```

页面刷新后看到图谱即可。

实时更新属于后续阶段。

---

## 5. 技术架构

### 5.1 后端分层

```text
RunEventStore / StreamBridge / RunJournal
        ↓
DeerGraph Event Mapper
        ↓
Graph Builder
        ↓
Snapshot API / GraphDelta
        ↓
Frontend AgentGraphCanvas
```

### 5.2 后端新增模块建议

```text
backend/packages/harness/deerflow/runtime/graph/
  __init__.py
  models.py
  sanitizer.py
  event_mapper.py
  builder.py
```

职责：

- `models.py`：定义 GraphNode、GraphEdge、GraphSnapshot、GraphDelta。
- `sanitizer.py`：摘要截断和敏感信息脱敏。
- `event_mapper.py`：把 RunEvent 映射为节点/边语义。
- `builder.py`：把一个 run 的事件列表构建成完整 graph snapshot。

### 5.3 API 路由建议

优先使用：

```text
/api/visual/runs/{thread_id}/{run_id}/graph
```

理由：

- DeerGraph 是产品可视化功能，不应污染 LangGraph 兼容 API。
- `/api/visual` 职责清晰。
- 后续可以扩展：

```text
/api/visual/runs/{thread_id}/{run_id}/graph/events
/api/visual/runs/{thread_id}/{run_id}/graph/delta
```

### 5.4 前端架构

前端使用 React Flow / `@xyflow/react`。

建议模块：

```text
frontend/src/components/agent-graph/AgentGraphCanvas.tsx
frontend/src/components/agent-graph/AgentGraphNode.tsx
frontend/src/components/agent-graph/AgentGraphEdge.tsx
frontend/src/components/agent-graph/AgentGraphDetailsPanel.tsx
frontend/src/components/agent-graph/types.ts
frontend/src/hooks/use-agent-graph.ts
frontend/src/core/api/agent-graph.ts
```

入口顺序：

1. 先做独立图谱页面，降低对聊天页的影响。
2. 再把同一个组件嵌入聊天页 `Agent Graph` Tab。

---

## 6. Graph 数据结构标准

### 6.1 GraphNode

```ts
type AgentGraphNode = {
  id: string;
  type: "user" | "lead_agent" | "subagent" | "tool" | "final" | "error";
  label: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled" | "timeout";
  threadId: string;
  runId: string;
  parentId?: string;
  correlationId?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  summary?: string;
  inputPreview?: string;
  outputPreview?: string;
  error?: string;
  metadata?: Record<string, unknown>;
};
```

### 6.2 GraphEdge

```ts
type AgentGraphEdge = {
  id: string;
  source: string;
  target: string;
  type: "input" | "delegates" | "returns" | "uses_tool" | "produces";
  label?: string;
  status?: "pending" | "active" | "completed" | "failed";
  correlationId?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};
```

### 6.3 GraphSnapshot

```ts
type AgentGraphSnapshot = {
  threadId: string;
  runId: string;
  version: number;
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
  truncated?: boolean;
  updatedAt: string;
};
```

### 6.4 GraphDelta

```ts
type AgentGraphDelta = {
  threadId: string;
  runId: string;
  seq?: number;
  op: "node.add" | "node.update" | "edge.add" | "edge.update" | "snapshot" | "done";
  node?: AgentGraphNode;
  edge?: AgentGraphEdge;
  snapshot?: AgentGraphSnapshot;
};
```

---

## 7. 事件映射规则

### 7.1 User 节点

来源：

```text
llm.human.input
```

生成：

```text
User node
User -> Lead Agent edge
```

### 7.2 Lead Agent 节点

来源：

```text
run.start
llm.ai.response
caller == lead_agent
```

生成：

```text
Lead Agent node
```

### 7.3 Subagent 节点

来源：

```text
llm.ai.response.tool_calls where tool name == task
```

关键字段：

```text
tool_call_id
```

生成：

```text
Subagent node
Lead Agent -> Subagent edge
```

### 7.4 Subagent 返回边

来源：

```text
llm.tool.result where tool_call_id matches task tool_call_id
```

生成：

```text
Subagent -> Lead Agent edge
Subagent node status = completed / failed inferred from result text or later task_* lifecycle events
```

### 7.5 Final 节点

来源：

```text
run.end
last lead_agent AIMessage without tool_calls
```

生成：

```text
Final node
Lead Agent -> Final edge
```

### 7.6 后续 Tool 节点

来源：

```text
llm.ai.response.tool_calls
llm.tool.result
```

规则：按 `tool_call_id` 配对。

MVP 可以先折叠普通 tool 节点，只突出 `task` / subagent。

---

## 8. 分阶段计划与验收标准

## 阶段 0：共同设计勘探与 ADR

### 目标

确认真实代码事实，冻结 DeerGraph 的事件源、API、前端入口和阶段边界。

### 必看文件

```text
backend/packages/harness/deerflow/runtime/journal.py
backend/packages/harness/deerflow/runtime/events/store/base.py
backend/packages/harness/deerflow/runtime/events/store/jsonl.py
backend/packages/harness/deerflow/runtime/events/store/memory.py
backend/packages/harness/deerflow/tools/builtins/task_tool.py
backend/packages/harness/deerflow/subagents/executor.py
backend/packages/harness/deerflow/runtime/runs/worker.py
backend/packages/harness/deerflow/runtime/stream_bridge/*
backend/app/gateway/routers/*
frontend/package.json
frontend/src/app/workspace/chats/[thread_id]/*
```

### 交付物

```text
docs/plans/2026-05-31-deergraph-design.md
docs/plans/deergraph-adr.md
```

### 验收标准

- 明确 graph snapshot API 的 router 位置。
- 明确 frontend 独立页面和聊天页 Tab 插入点。
- 明确现有事件如何还原 MVP 图谱。
- 明确 `task_*` custom stream 事件如何被后续图谱消费。
- 明确 RunEventStore `limit=500` 如何处理。
- 明确脱敏策略。
- 不写功能代码。

---

## 阶段 1：Graph Core Snapshot

### 目标

基于现有持久化事件实现真实、非 mock 的静态 DeerGraph MVP。

### 成品

```text
GET /api/visual/runs/{thread_id}/{run_id}/graph
```

返回：

```json
{
  "threadId": "...",
  "runId": "...",
  "nodes": [],
  "edges": [],
  "truncated": false,
  "updatedAt": "..."
}
```

### 实现内容

- 新增 graph models。
- 新增 sanitizer。
- 新增 event mapper。
- 新增 graph builder。
- 新增 snapshot API。
- 支持从 `llm.human.input`、`llm.ai.response.tool_calls`、`llm.tool.result`、`run.end` 生成图谱。
- 支持 `task` tool_call 映射为 subagent 节点。
- 支持 `tool_call_id` 配对。
- 处理 `list_events` 截断风险：提高 limit、分页，或返回 `truncated=true`。

### 验收标准

- 静态 snapshot API 可返回真实 DeerFlow run 图谱。
- 图中至少包含 User、Lead Agent、Subagent、Final。
- 至少包含 User -> Lead、Lead -> Subagent、Subagent -> Lead、Lead -> Final。
- 无事件时返回空图，不报错。
- 重复调用结果稳定。
- 敏感信息被脱敏。

### 测试标准

- mapper 单元测试：human input -> user node。
- mapper 单元测试：task tool_call -> subagent node + delegates edge。
- mapper 单元测试：tool_result -> returns edge。
- builder 单元测试：完整事件序列 -> MVP 图谱。
- sanitizer 单元测试：secret/key/token/password 脱敏。
- API 测试：空 run、正常 run、长 run/truncated。

---

## 阶段 2：Task Lifecycle Enrichment

### 目标

让 DeerGraph 更准确展示 subagent 的运行中、失败、取消、超时等生命周期状态。

### 重要共识

阶段 2 不是重新发明 `subagent.*` 事件，而是复用 DeerFlow 已有 `task_*` 事件语义：

```text
task_started
task_running
task_completed
task_failed
task_cancelled
task_timed_out
```

### 推荐实现方向

优先研究如何让这些 custom stream 事件被图谱稳定消费：

1. 复用现有 StreamBridge/SSE 做实时 GraphDelta。
2. 或让 RunJournal/worker 侧以统一 best-effort 方式将 `task_*` 生命周期事件持久化。
3. 不建议在 `task_tool.py` 中直接绕过 RunJournal 写 RunEventStore，避免分散 seq、flush、错误吞掉等语义。

### 验收标准

- task started 后，subagent 节点状态可变为 running。
- task completed 后，subagent 节点状态 completed。
- task failed/cancelled/timed_out 后，subagent 节点状态分别显示 failed/cancelled/timeout。
- 生命周期事件失败不影响 DeerFlow 主任务。
- 多个并发 task/subagent 能按 `tool_call_id` 正确关联。

### 测试标准

- task_started -> node.running。
- task_completed -> node.completed。
- task_failed -> node.failed。
- task_cancelled -> node.cancelled。
- task_timed_out -> node.timeout。
- 并发多个 tool_call_id 不串线。

---

## 阶段 3：Frontend Static Graph

### 目标

用 React Flow 展示阶段 1 的真实 snapshot 图谱。

### 成品

先做独立图谱页面，例如：

```text
/workspace/chats/{thread_id}/runs/{run_id}/graph
```

实际路径阶段 0 根据现有前端路由确认。

### 实现内容

- 安装/使用 `@xyflow/react`。
- 实现 `AgentGraphCanvas`。
- 实现自定义节点和边。
- 实现详情面板。
- 接真实 snapshot API。
- 提供空状态、错误状态、加载状态。

### 验收标准

- 浏览器中能看到真实 DeerFlow run 的图谱。
- 节点颜色区分 User、Lead、Subagent、Final。
- 点击节点能看到摘要和状态。
- 页面刷新后仍可展示。
- 不影响现有聊天页。

### 测试标准

- 空图渲染。
- 正常图渲染。
- failed/timeout 状态渲染。
- 点击节点打开详情。
- API 错误状态渲染。

---

## 阶段 4：Chat Tab Integration + Near-Realtime

### 目标

把 DeerGraph 集成到 DeerFlow 聊天页，并逐步支持近实时/实时更新。

### 前端入口

推荐：

```text
Chat | Files | Agent Graph
```

同时保留独立图谱页面用于全屏演示。

两者复用同一个：

```text
AgentGraphCanvas
useAgentGraph
agent-graph API client
```

### 实时路线

1. 先 snapshot + polling。
2. 后续复用现有 StreamBridge/SSE/run event stream 生成 GraphDelta。
3. 不优先新建 WebSocket。
4. 不优先重复造一套 `/graph/stream`，除非阶段 0/4 证明现有 SSE 生命周期无法满足图谱订阅。

### 验收标准

- 聊天页可以切到 Agent Graph Tab。
- run 执行时图谱能随轮询或 SSE 更新。
- 断线/刷新后能重新拉 snapshot 恢复。
- 图谱错误不影响聊天。

---

## 阶段 5：Interaction & Readability

### 目标

让图谱从“能看”变成“好读”。

### 功能

- 自动布局。
- 折叠普通工具节点。
- 展开/收起 subagent 详情。
- 过滤成功/失败/工具节点。
- 搜索节点。
- 时间轴回放。
- 显示耗时、usage 摘要。
- 高亮失败路径。

### 验收标准

- 30 个节点以内布局清晰。
- 用户能快速看懂 Lead 调了哪些 Subagent。
- 用户能一键隐藏普通 tool，只看 Agent 流程。
- 失败节点清晰可见。

---

## 阶段 6：Demo & Documentation

### 目标

形成可交付演示材料。

### 成品

```text
docs/deergraph.md
docs/demo/deergraph-demo.md
docs/demo/deergraph-prompts.md
```

### 演示标准

- 一个任务至少触发 2 个 subagent。
- 图中出现 User、Lead Agent、Subagent、Final。
- 若阶段 2/4 完成，能看到 running/completed/failed 状态变化。
- 有截图或 GIF 展示。

---

## 9. OpenClaw × Claude Code 协作流程

### 9.1 每阶段流程

每阶段都遵循：

```text
Claude Code 提出阶段实现方案
        ↓
OpenClaw 审查方案
        ↓
用户确认关键产品方向，如有必要
        ↓
Claude Code 按 TDD 实现
        ↓
Claude Code 提交测试结果和手动验证步骤
        ↓
OpenClaw 审查代码和验收结果
        ↓
进入下一阶段
```

### 9.2 Claude Code 每阶段必须输出

```text
1. 本阶段目标
2. 实际改动文件列表
3. 关键设计决策
4. 测试命令与结果
5. 手动验证步骤
6. 已知问题
7. 下一阶段建议
8. 需要 OpenClaw/用户确认的问题
```

### 9.3 OpenClaw 审查重点

- 是否符合“节点/边多 Agent 图谱”目标。
- 是否基于真实 runtime event。
- 是否没有做成 mock demo。
- 是否不破坏 DeerFlow 主链路。
- 是否复用现有 `task_*` 事件语义。
- 是否脱敏。
- 是否测试覆盖关键 mapper 和状态转换。

---

## 10. 风险与应对

| 风险 | 说明 | 应对 |
|---|---|---|
| 事件误判 | 把不存在的事件当作事实 | 阶段 0 先用代码事实冻结事件源 |
| mock 化 | 前端做成假数据图 | 阶段 1 先完成真实 snapshot API |
| 事件截断 | `list_events` 默认 limit 可能不够 | API 显式分页/提高 limit/返回 truncated |
| 敏感信息泄露 | tool input/output 可能含 secret | sanitizer 默认脱敏，只返回摘要 |
| 破坏主链路 | 图谱写入异常影响任务 | best-effort，异常吞掉并记录日志 |
| 前端耦合聊天页 | 早期改聊天页风险高 | 先独立页面，再嵌入 Tab |
| 重复造实时栈 | 新 WebSocket/SSE 增复杂度 | 优先 snapshot/polling，再复用现有 SSE |

---

## 11. 最终共识总结

OpenClaw 与 Claude Code 达成一致：

1. DeerGraph 是 DeerFlow 内部的多 Agent 运行图谱，不是 trace 表格。
2. 阶段 1 就能基于现有持久化事件做真实 MVP。
3. MVP 的核心链路是 `User -> Lead Agent -> Subagent -> Lead Agent -> Final`。
4. 不必一开始展开 subagent 内部工具调用。
5. 不新增平行的 `subagent.*` 事件体系，优先复用现有 `task_*` 语义。
6. 阶段 2 的重点是生命周期状态丰富，而不是 MVP 的前置阻塞。
7. 前端先独立页面，后聊天页 Tab，复用组件。
8. 实时先 polling，后复用现有 SSE/StreamBridge。
9. 每阶段都必须 TDD、可验收、可回滚。

---

## 12. 给 Claude Code 的下一条任务

```text
请基于以下文件执行 DeerGraph 阶段 0，不要写功能代码：

1. docs/plans/2026-05-31-deergraph-joint-plan.md
2. docs/plans/deergraph-adr.md
3. docs/plans/2026-05-31-deergraph-claude-review.md

阶段 0 目标：输出 docs/plans/2026-05-31-deergraph-design.md，并更新 deergraph-adr.md。

要求：
1. 不写功能代码。
2. 确认 graph snapshot API router 位置。
3. 确认前端独立图谱页面路径与聊天页 Tab 插入点。
4. 确认现有持久化事件如何生成 MVP 图谱。
5. 确认 task_* custom stream 如何在阶段 2/4 被 graph 消费。
6. 确认 list_events 截断处理方案。
7. 确认 sanitizer 规则。
8. 完成后停止，等待 OpenClaw 审查。
```
