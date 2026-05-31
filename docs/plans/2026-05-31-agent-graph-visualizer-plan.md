# DeerFlow 多 Agent 运行图谱（Agent Graph Visualizer）项目计划书

> **For Claude Code / implementer:** 本计划用于和 OpenClaw 共同讨论并逐步实现。实现阶段必须采用 TDD：先写失败测试，再写最小实现，再跑通测试。不要一次性大改；每阶段完成后必须可演示、可验收、可回滚。

**项目名称：** DeerGraph  
**中文名：** DeerFlow 多智能体运行图谱  
**英文描述：** A visual runtime graph for DeerFlow multi-agent execution.  
**基座项目：** `C:\Users\hjl\Projects\deer-flow`  
**目标：** 基于 DeerFlow 现有 multi-agent runtime，为用户提供类似“马威斯”风格的图像化交互视图：将一次任务中主 Agent、子 Agent、工具调用、结果回流等过程实时绘制成知识图谱/点线图，让用户直观看懂多 Agent 工作流程。  
**核心成品：** 一个可在 DeerFlow Web UI 中打开的“运行图谱”页面，点代表 Agent / Subagent / Tool / Artifact / Final Answer，线代表任务派发、工具调用、结果返回、汇总依赖，运行时实时更新节点状态。

---

## 0. 背景与问题定义

### 0.1 已确认的先前条件

以下条件来自 OpenClaw 与用户此前围绕 DeerFlow 的部署、观测和可视化目标讨论。Claude Code 在设计 DeerGraph 时必须遵守：

1. **正式项目目录**：`C:\Users\hjl\Projects\deer-flow`，不要使用旧仓库路径 `C:\Users\hjl\.openclaw\workspace\dify_project\repos\deer-flow`。
2. **DeerFlow 当前已能运行**：Docker Web UI 已验证可用，访问地址为 `http://localhost:2026`。
3. **核心 Docker 服务**：目前主要启动 `nginx`、`frontend`、`gateway`，暂不依赖 Kubernetes/provisioner。
4. **控制台入口已存在**：`backend/main.py` 支持 `uv run main.py` 和 `uv run main.py --once "..."`，不要破坏该入口。
5. **Langfuse 已接入但不是目标本体**：Langfuse 可作为 trace/日志辅助，但 DeerGraph 不能做成 Langfuse/LangSmith 风格的 trace 表格。
6. **LangGraph Studio 不是最终答案**：Studio 更像开发者调试器；DeerGraph 要做的是 DeerFlow Web UI 内的产品级多 Agent 运行图谱。
7. **用户真正目标**：类似“腾讯马威斯”的图像化、节点/边、可交互、多 Agent 运行过程视图。
8. **不要主动创建一键脚本**：DeerFlow 使用说明优先给原生命令；本项目除必要源码、测试、文档外，不要额外生成启动脚本。
9. **敏感信息不能泄露**：计划、日志、图谱节点详情中不得明文暴露 Langfuse/LangSmith/API secret key。
10. **实现必须基于真实 runtime event**：可以用 mock 做前端单元测试，但成品不能是摆拍图，必须来自 DeerFlow 实际 run/subagent/tool 事件。

### 0.2 当前 DeerFlow 基础

当前 DeerFlow 已经具备：

- `lead_agent` 主 Agent
- `task(...)` 工具派发子 Agent
- `SubagentExecutor` 执行隔离子 Agent
- `RunJournal` / `RunEventStore` 记录运行事件
- Langfuse / LangSmith 追踪支持
- Web UI 聊天界面

### 0.3 Claude Code 勘探后的关键技术前提

Claude Code 从代码实现者角度审查后指出一个关键事实：

> 子 Agent 不是在主链路 callback 中运行。`SubagentExecutor` 会把子 Agent 提交到独立常驻事件循环线程；子 Agent 内部目前主要使用自己的 token collector 回调收集 token，不会自然写入主 run 的 `RunEventStore`。

这意味着：

- `RunJournal` 目前主要能看到主图根上的事件。
- 主 Agent 调 `task(...)` 通常只能在主 run 中留下 `task` 工具调用相关事件。
- 子 Agent 内部的 LLM 调用和工具调用，当前不能假定已经存在于 `RunEventStore` 中。
- DeerGraph 如果要展示真正的多 Agent 图谱，必须尽早补齐 subagent 生命周期事件。
- MVP 可先实现低侵入版本：记录 `Lead Agent -> Subagent -> Lead Agent` 的派发和返回；子 Agent 内部工具展开作为后续增强。

但现有可观测方式主要是：

1. 聊天消息流：用户只能看到文字结果和部分工具调用。
2. Langfuse / LangSmith：偏 trace 表格、日志、token、latency。
3. LangGraph Studio：偏开发者调试底层 graph。

用户真正想要的是：

> 在 DeerFlow 执行复杂任务时，自动把“主 Agent 如何分解问题、调了哪些子 Agent、每个子 Agent 调了哪些工具、各结果如何回流汇总”画成类似知识图谱/数据结构图的运行时点线图。

---

## 1. 产品目标

### 1.1 面向用户的目标

让用户在 DeerFlow Web UI 中能看到：

- 主 Agent 正在做什么
- 问题被拆成了哪些子任务
- 哪些子 Agent 被调用
- 子 Agent 之间是否有依赖或结果回流
- 每个子 Agent 调用了哪些工具
- 工具调用成功/失败/耗时
- 最终答案是如何从各个子 Agent 的结果汇总出来的

### 1.2 面向开发者的目标

让开发者能基于图谱快速判断：

- 子 Agent 是否真正被调用
- 工具调用是否过多或失败
- 哪个节点耗时最长
- 哪个子任务没有返回有效结果
- 哪个阶段发生错误
- 多 Agent 执行链路是否符合预期

---

## 2. 非目标（第一版不做）

MVP 阶段不要做以下事情：

- 不做可拖拽编排 Agent 工作流。
- 不做用户手动创建 Agent 图。
- 不做复杂权限系统。
- 不替代 Langfuse / LangSmith。
- 不要求像商业产品一样炫酷动画。
- 不做跨多次任务的知识图谱沉淀。
- 不把所有 LLM token 逐字可视化。
- 不改动 DeerFlow 的核心 agent 行为逻辑。

第一版只做：**把当前 run 的实际执行过程可视化。**

---

## 3. 最终形态描述

### 3.1 页面入口

建议新增页面：

```text
/workspace/chats/[thread_id]/graph
```

或在现有聊天页中新增右侧 Tab：

```text
Chat | Files | Agent Graph
```

优先推荐：**现有聊天页内新增 Agent Graph Tab**，因为用户通常一边看回答，一边看执行图谱。

### 3.2 图谱样式

节点类型：

| 类型 | 含义 | 建议颜色 |
|---|---|---|
| `user` | 用户输入任务 | 灰色 |
| `lead_agent` | DeerFlow 主 Agent | 蓝色 |
| `subagent` | 被 `task(...)` 派发的小 Agent | 紫色 |
| `tool` | 工具调用，如 web_search/bash/file_read | 橙色 |
| `llm` | 模型思考/生成节点，可选 | 青色 |
| `artifact` | 文件/报告/图表等产物 | 绿色 |
| `final` | 最终答案 | 深绿色 |
| `error` | 错误节点或失败状态 | 红色 |

节点状态：

| 状态 | UI 表现 |
|---|---|
| `pending` | 灰色、虚线边框 |
| `running` | 高亮、轻微 pulse 动画 |
| `completed` | 绿色勾选 |
| `failed` | 红色叉号 |
| `cancelled` | 灰色删除线 |
| `streaming` | 边线流动动画 |

边类型：

| 类型 | 含义 |
|---|---|
| `input` | 用户任务输入到主 Agent |
| `delegates` | 主 Agent 派发子任务 |
| `uses_tool` | Agent 调用工具 |
| `returns` | 工具/子 Agent 返回结果 |
| `merges` | 主 Agent 汇总多个子结果 |
| `produces` | 生成最终答案/文件产物 |

### 3.3 右侧详情面板

点击节点后显示：

- 节点 ID
- 节点类型
- 节点状态
- 开始时间 / 结束时间 / 耗时
- 输入摘要
- 输出摘要
- 错误信息
- 原始事件列表
- token / 模型信息（如果有）

点击边后显示：

- source
- target
- 关系类型
- 事件时间
- 传递内容摘要

---

## 4. 技术架构

### 4.1 后端架构

基于现有 DeerFlow runtime：

```text
LangChain callbacks / SubagentExecutor
        ↓
RunJournal / RunEventStore
        ↓
Graph Event Normalizer
        ↓
Graph Builder
        ↓
HTTP API + SSE stream
        ↓
Frontend React Flow page
```

新增后端模块建议：

```text
backend/packages/harness/deerflow/runtime/graph/
  __init__.py
  models.py              # GraphNode / GraphEdge / GraphSnapshot / GraphDelta
  event_mapper.py        # Run events -> graph delta
  builder.py             # events -> graph snapshot
  stream.py              # stream graph deltas if needed
```

新增 API 路由建议：

```text
GET /api/visual/runs/{thread_id}/{run_id}/graph
GET /api/visual/runs/{thread_id}/{run_id}/graph/events
GET /api/visual/runs/{thread_id}/{run_id}/graph/stream
```

如果现有 API 命名更适合放在 LangGraph namespace，也可以使用：

```text
/api/langgraph/threads/{thread_id}/runs/{run_id}/graph
```

但建议不要污染 LangGraph 标准兼容接口，优先用 `/api/visual/...`。

### 4.2 前端架构

使用现有 Next.js 前端。

推荐依赖：

```text
@xyflow/react
```

即 React Flow 新包。

新增前端模块建议：

```text
frontend/src/app/workspace/chats/[thread_id]/graph/page.tsx
frontend/src/components/agent-graph/AgentGraphCanvas.tsx
frontend/src/components/agent-graph/AgentGraphNode.tsx
frontend/src/components/agent-graph/AgentGraphEdge.tsx
frontend/src/components/agent-graph/AgentGraphDetailsPanel.tsx
frontend/src/components/agent-graph/agent-graph-types.ts
frontend/src/hooks/use-agent-graph.ts
frontend/src/core/api/agent-graph.ts
```

---

## 5. 数据结构标准

### 5.1 GraphNode

```ts
type AgentGraphNode = {
  id: string;
  type: "user" | "lead_agent" | "subagent" | "tool" | "llm" | "artifact" | "final" | "error";
  label: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled" | "streaming";
  parentId?: string;
  runId: string;
  threadId: string;
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

### 5.2 GraphEdge

```ts
type AgentGraphEdge = {
  id: string;
  source: string;
  target: string;
  type: "input" | "delegates" | "uses_tool" | "returns" | "merges" | "produces";
  label?: string;
  status?: "pending" | "active" | "completed" | "failed";
  createdAt?: string;
  metadata?: Record<string, unknown>;
};
```

### 5.3 GraphSnapshot

```ts
type AgentGraphSnapshot = {
  threadId: string;
  runId: string;
  version: number;
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
  updatedAt: string;
};
```

### 5.4 GraphDelta

```ts
type AgentGraphDelta = {
  threadId: string;
  runId: string;
  seq: number;
  op: "node.add" | "node.update" | "edge.add" | "edge.update" | "snapshot" | "done";
  node?: AgentGraphNode;
  edge?: AgentGraphEdge;
  snapshot?: AgentGraphSnapshot;
};
```

---

## 6. 分阶段实施计划与成品标准

## 阶段 0：需求冻结与代码勘探

### 目标

确认 DeerFlow 现有事件链路、前端路由结构、可插入点，形成技术设计说明。

### 交付物

1. `docs/plans/2026-05-31-agent-graph-visualizer-plan.md`（本文件）
2. `docs/plans/2026-05-31-agent-graph-visualizer-design.md`
3. 事件源清单：哪些已有事件可直接用，哪些需要补。
4. API 接入点清单。
5. 前端接入点清单。

### 验收标准

- 明确现有 `RunJournal` 能捕获哪些事件。
- 明确 `SubagentExecutor` 中需要新增哪些事件。
- 明确图谱 API 放在哪个 router。
- 明确前端页面路径。
- 不改业务逻辑。
- 不引入新依赖。

### 质量标准

- 设计文档必须能让 Claude Code 独立理解项目目标。
- 必须指出“不做什么”，避免范围膨胀。

---

## 阶段 1：离线图谱核心与 Snapshot API（不实时）

### 目标

先建立 DeerGraph 的后端核心：数据模型、事件映射器、静态图谱构建器和只读 snapshot API。从一次已完成 run 的主链路事件中生成静态图谱 JSON。

### 成品

后端新增接口：

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
  "updatedAt": "..."
}
```

### 实现范围

- 新增 graph 数据模型。
- 新增 event mapper。
- 从 RunEventStore 读取事件。
- 映射基础节点：`user`、`lead_agent`、`tool`、`final`。
- 映射基础边：`input`、`uses_tool`、`returns`、`produces`。
- 先不要求 subagent 展开完整，只要能显示 task 工具节点。

### 验收标准

- 给定一组测试事件，能稳定生成 nodes/edges。
- 重复调用接口返回一致结果。
- 没有事件时返回空图，不报错。
- 工具调用事件能显示为 tool 节点。
- 失败事件能显示红色 error 节点或 failed 状态。

### 测试标准

后端单元测试必须覆盖：

1. `run.start` -> lead_agent 节点。
2. `llm.human.input` -> user 节点和 input 边。
3. `llm.tool.result` -> tool 节点和 returns 边。
4. `run.end` -> final 节点。
5. `run.error` -> failed 状态。
6. 空事件列表 -> 空图。

推荐测试文件：

```text
backend/tests/runtime/graph/test_event_mapper.py
backend/tests/runtime/graph/test_builder.py
```

### 阶段完成定义

执行测试通过，并且可以用 curl/Invoke-WebRequest 获取某个 run 的图谱 JSON。

---

## 阶段 2：子 Agent 生命周期事件补齐（前端前置依赖）

### 目标

在进入前端图谱页面开发前，先让后端能明确显示主 Agent 调用了哪些子 Agent，而不是只显示一个普通 `task` 工具。

> 该阶段是 DeerGraph 从“普通工具调用图”变成“多 Agent 运行图谱”的关键。Claude Code 审查后确认：子 Agent 内部事件当前不会自动进入 RunEventStore，所以必须单独补。

### 成品

新增/规范以下事件类型：

```text
subagent.spawn
subagent.start
subagent.status
subagent.finish
subagent.error
```

每个事件至少包含：

```json
{
  "subagent_id": "...",
  "subagent_name": "...",
  "parent_run_id": "...",
  "task": "...",
  "status": "running|completed|failed|cancelled",
  "result_preview": "..."
}
```

### 实现范围

MVP 推荐低侵入路线：

- 优先在 `task` 工具层或主链路可安全拿到 `run_id` / `thread_id` / event writer 的位置包裹 subagent 调用。
- 记录 `subagent.spawn`、`subagent.start`、`subagent.finish`、`subagent.error` 等生命周期事件。
- 暂不强制展开子 Agent 内部 LLM/tool 事件，避免一开始就引入跨线程/跨 loop 写 store 风险。
- 不改变子 Agent 的执行逻辑。
- 不影响现有 Langfuse / LangSmith tracing。
- 事件写入失败必须 best-effort：只记录日志，不中断 DeerFlow 主任务。

后续增强路线：

- 如果必须展示 `Subagent -> Tool` 内部细节，再评估向 `SubagentExecutor` 注入 `run_id` 与 event writer，或在 subagent middleware 层采集事件。
- 该增强必须先解决跨线程写 `RunEventStore` 的串行化/锁问题。

### 验收标准

- 主 Agent 调用 `task(...)` 后，RunEventStore 中可查到 `subagent.spawn`。
- 子 Agent 开始时有 `subagent.start`。
- 子 Agent 完成时有 `subagent.finish`。
- 子 Agent 失败时有 `subagent.error`。
- graph builder 能生成：

```text
Lead Agent --delegates--> Subagent
Subagent --returns--> Lead Agent
```

### 测试标准

必须有单元测试模拟：

1. subagent 成功执行。
2. subagent 抛异常。
3. subagent 被取消。
4. 多个 subagent 并发时 ID 不冲突。

### 阶段完成定义

运行一个触发 `task` 的 DeerFlow 任务后，图谱 JSON 中出现多个 `subagent` 节点。

---

## 阶段 3：前端静态图谱页面

### 目标

在 DeerFlow 前端中显示某次 run 的图谱快照。

### 成品

新增页面或 Tab：

```text
Agent Graph
```

页面包含：

- React Flow 画布
- 自动布局
- 节点颜色区分类型
- 边类型区分关系
- 右侧详情面板
- 空状态提示
- 错误状态提示

### 实现范围

- 安装 `@xyflow/react`。
- 封装 API client。
- 实现 `AgentGraphCanvas`。
- 实现自定义节点组件。
- 实现详情面板。
- 先使用静态接口拉取图谱，不做实时更新。

### 验收标准

- 打开一个已有 thread/run，能看到图谱。
- 图谱至少包含 user、lead_agent、tool/final 节点。
- 有 subagent 事件时显示 subagent 节点。
- 点击节点显示详情。
- 节点状态颜色正确。
- 页面刷新后图谱仍可显示。

### 测试标准

前端测试必须覆盖：

1. API 返回空图时显示空状态。
2. 渲染 user/lead_agent/subagent/tool/final 节点。
3. 点击节点打开详情。
4. failed 节点显示错误状态。

推荐测试文件：

```text
frontend/src/components/agent-graph/__tests__/AgentGraphCanvas.test.tsx
frontend/src/hooks/__tests__/use-agent-graph.test.ts
```

### 阶段完成定义

可在浏览器中看到一张静态、多节点、多边的 DeerFlow run 图谱。

---

## 阶段 4：实时运行图谱

### 目标

DeerFlow 执行任务时，图谱随事件实时更新。

实时机制建议采用渐进式路线：先 snapshot + polling，再复用 DeerFlow 现有 run 事件/SSE 基础设施；除非确有必要，不优先新建 WebSocket 或重复造一套流式传输栈。

### 成品

新增 SSE 接口：

```text
GET /api/visual/runs/{thread_id}/{run_id}/graph/stream
```

前端实时更新：

- 新增节点
- 更新节点状态
- 新增边
- 更新边状态
- 运行中动画
- 完成后停止流

### 实现范围

- 后端把 RunEventStore/StreamBridge 事件转为 GraphDelta。
- 前端使用 EventSource 或现有流式机制接收 GraphDelta。
- 处理断线重连：重连后先拉 snapshot，再继续 stream。
- 不要求毫秒级实时，1 秒内更新即可。

### 验收标准

- 用户发起任务后，lead_agent 节点立即出现 running。
- 调用子 Agent 时，subagent 节点动态出现。
- 工具调用时，tool 节点动态出现。
- 节点完成后状态变 completed。
- 失败时状态变 failed 并显示错误。
- SSE 断开后页面不崩溃。

### 测试标准

- 后端 GraphDelta mapper 单元测试。
- 前端 EventSource mock 测试。
- E2E 测试：模拟 SSE 事件，画布逐步更新。

### 阶段完成定义

跑一个复杂 DeerFlow 任务时，用户能实时看到多 Agent 图谱逐步展开。

---

## 阶段 5：交互增强与可读性优化

### 目标

让图谱从“能看”变成“好读”。

### 成品特性

- 自动布局：从左到右或从上到下。
- 子 Agent 分组：同一批派发的 subagents 用 group 框起来。
- 工具节点可折叠。
- 过滤器：显示/隐藏 LLM 节点、工具节点、成功节点。
- 时间轴：按事件顺序回放。
- 搜索：按节点 label / tool name 搜索。
- 详情面板展示输入输出摘要。
- tooltip 展示耗时/token。

### 验收标准

- 30 个节点以内图谱不混乱。
- 用户能一键隐藏工具节点，只看 Agent 流程。
- 用户能点击一个子 Agent 看其任务和结果摘要。
- 用户能通过时间轴回放执行过程。

### 测试标准

- 布局函数稳定测试。
- 过滤器状态测试。
- 节点详情摘要测试。
- 时间轴回放状态测试。

### 阶段完成定义

非开发者用户能通过图谱理解一次复杂任务的执行过程。

---

## 阶段 6：演示与文档

### 目标

形成可交付演示材料，方便向老师/同学/项目评审展示。

### 成品

1. `docs/agent-graph-visualizer.md`
2. 演示脚本：`docs/demo/agent-graph-demo.md`
3. 示例任务集：`docs/demo/agent-graph-prompts.md`
4. 截图或 GIF：展示运行图谱动态展开。

### 推荐演示任务

```text
请用 3 个子 Agent 并行调研 A 股 ETF 五等权策略：
1. 历史收益与最大回撤
2. 与单押黄金的对比
3. 与 60/40 股债组合的对比
最后合并成一份结构化报告。
```

### 验收标准

- 演示任务能触发至少 2 个 subagent。
- 图谱中至少出现：user、lead_agent、2 个 subagent、2 个 tool、final。
- 最终截图能清楚表达多 Agent 工作流。
- 文档说明如何启动、如何查看、如何排错。

---

## 7. 全局验收标准

项目最终完成时必须满足：

### 功能验收

- 能在 DeerFlow Web UI 中打开运行图谱。
- 能显示主 Agent、子 Agent、工具、最终结果。
- 能显示节点状态：pending/running/completed/failed。
- 能显示调用关系和结果回流。
- 能点击节点查看详情。
- 能实时更新。
- 复杂任务中可读性良好。

### 技术验收

- 后端测试通过。
- 前端测试通过。
- Docker dev 模式可运行。
- 不破坏原有聊天功能。
- 不破坏 Langfuse/LangSmith tracing。
- 不显著增加普通聊天延迟。
- 失败事件不会导致 Web UI 崩溃。

### 性能验收

- 50 个节点以内流畅展示。
- 单次 graph snapshot 接口响应 < 1 秒。
- SSE 更新延迟一般 < 1 秒。
- 大输出内容必须截断预览，避免前端卡死。

### 安全验收

- 不在图谱默认展示完整 API Key、token、secret。
- 工具输入输出需要做敏感信息脱敏。
- 原始 prompt/output 详情需要按现有权限模型访问。

---

## 8. 推荐开发顺序

根据 Claude Code 审查意见，推荐顺序调整为：**先冻结真实事件契约，再做前端**。

1. 阶段 0：代码勘探与设计文档，确认真实事件源、subagent 事件缺口、API/router/前端插入点。
2. 写后端 graph 数据模型测试。
3. 写 event mapper 测试。
4. 实现静态 graph builder。
5. 暴露 graph snapshot API。
6. 补 subagent lifecycle 事件，至少支持 `Lead Agent -> Subagent -> Lead Agent`。
7. 接入 subagent 图谱到 snapshot builder。
8. 前端 mock 数据画图。
9. 前端接真实 snapshot API。
10. 加 snapshot polling 或复用现有 run event stream 实时更新。
11. 做交互和美化。
12. 写演示文档。

---

## 9. OpenClaw × Claude Code 协作协议

本项目由 Claude Code 与 OpenClaw 共同推进：

- **Claude Code 角色：** 主要负责代码勘探、设计草案、实现、测试、局部重构。
- **OpenClaw 角色：** 主要负责需求守门、架构审查、阶段验收、风险控制、用户偏好对齐。
- **用户角色：** 决策产品方向、确认阶段性成品是否符合预期。

### 9.1 协作原则

1. **先讨论，后实现。** 每个阶段开始前，Claude Code 必须先输出阶段设计/执行计划，OpenClaw 审查后再进入代码实现。
2. **小步提交。** 不允许一次性完成多个阶段；每个阶段必须独立可测试、可演示、可回滚。
3. **TDD 优先。** 后端 graph mapper/builder、前端 graph rendering、SSE delta 处理都应先写测试。
4. **不破坏主流程。** DeerGraph 是旁路观测能力，任何事件记录/图谱生成失败都不得中断 DeerFlow 正常聊天和 agent 执行。
5. **真实事件优先。** 禁止把项目做成只展示 mock 数据的 UI demo；mock 只能用于前端早期开发和测试。
6. **敏感信息默认脱敏。** prompt、tool input/output、env、token、secret 不得默认完整暴露在图谱节点中。
7. **阶段完成必须可验收。** 每个阶段交付时必须说明改了哪些文件、跑了哪些测试、如何手动验证。

### 9.2 Claude Code 每阶段必须提交的内容

每个阶段结束时，Claude Code 必须输出以下内容：

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

### 9.3 OpenClaw 审查清单

OpenClaw 审查时重点检查：

- 是否符合用户真正目标：图形化节点/边运行视图，而不是 trace 表格。
- 是否仍基于 DeerFlow 真实 runtime events。
- 是否保持阶段边界，没有越界大改。
- 是否补了测试。
- 是否存在敏感信息泄露。
- 是否破坏 Docker Web UI、控制台模式、Langfuse/LangSmith 兼容性。
- 是否需要用户做产品方向确认。

### 9.4 推荐读取文件

Claude Code 开始阶段 0 时，先读这些文件：

```text
backend/packages/harness/deerflow/runtime/journal.py
backend/packages/harness/deerflow/runtime/events/store/base.py
backend/packages/harness/deerflow/runtime/events/store/db.py
backend/packages/harness/deerflow/subagents/executor.py
backend/packages/harness/deerflow/agents/lead_agent/agent.py
backend/packages/harness/deerflow/client.py
backend/langgraph.json
frontend/package.json
frontend/src/app/workspace/chats/[thread_id]/page.tsx
frontend/src/components/ai-elements/*
```

如果某些路径不存在，Claude Code 应先搜索实际路径并在设计文档中说明。

### 9.5 阶段审查门

| 阶段 | Claude Code 输出 | OpenClaw 审查重点 | 是否允许写功能代码 |
|---|---|---|---|
| 阶段 0 | 设计文档、事件源清单、API/前端插入点 | 架构是否正确、范围是否收敛 | 否 |
| 阶段 1 | 后端 snapshot API + 测试 | graph model/mapper 是否可靠 | 是 |
| 阶段 2 | subagent 生命周期事件 + 测试 | 是否不破坏 agent 主链路 | 是 |
| 阶段 3 | 静态前端图谱页面 + 测试 | 是否真实接 API，非纯 mock | 是 |
| 阶段 4 | SSE 实时图谱 + 测试 | 断线/失败/性能处理 | 是 |
| 阶段 5 | 交互增强 | 可读性、折叠、过滤、详情 | 是 |
| 阶段 6 | 文档和演示 | 是否可交付展示 | 是 |

### 9.6 架构决策记录 ADR

重大决策必须记录到：

```text
docs/plans/deergraph-adr.md
```

Claude Code 首轮审查纪要保存于：

```text
docs/plans/2026-05-31-deergraph-claude-review.md
```

建议格式：

```text
# ADR-N: 标题

日期：YYYY-MM-DD
状态：Proposed / Accepted / Rejected
背景：
决策：
备选方案：
影响：
```

必须记录的 ADR 包括：

1. 图谱 API namespace 选择：`/api/visual` 还是 `/api/langgraph/...`。
2. 前端入口选择：独立页面还是聊天页 Tab。
3. 实时机制选择：SSE、WebSocket、polling。
4. 图布局方案选择：React Flow 内置布局、Dagre、ELK 等。
5. subagent lifecycle 事件注入点。
6. 敏感信息脱敏策略。

---

## 10. 风险与应对

### 风险 1：现有事件不够细

应对：先用 tool/task 事件生成粗图，再逐步补 `subagent.*` 事件。

### 风险 2：图谱太乱

应对：默认折叠工具节点；只显示 Agent 层级，用户点击展开工具。

### 风险 3：实时流难接

应对：先做 snapshot，再做 polling，最后再 SSE。MVP 不强依赖实时。

### 风险 4：敏感信息泄露

应对：默认只显示摘要，原始输入输出折叠，并做 key/token 脱敏。

### 风险 5：破坏 DeerFlow 原有运行

应对：所有 graph 逻辑旁路实现，不影响 agent 主链路；事件写入失败不得中断任务执行。

---

## 11. 最小可交付版本（MVP）定义

如果时间有限，MVP 只需要做到：

1. 一个后端接口返回 graph snapshot。
2. 一个前端页面用 React Flow 展示 graph。
3. 图中至少有：用户、主 Agent、task/subagent、tool、final。
4. 节点有状态颜色。
5. 点击节点能看摘要。
6. 能用一个复杂任务演示图谱生成。
7. 至少能显示 `Lead Agent -> Subagent -> Lead Agent` 的真实派发/回流关系；子 Agent 内部工具展开可作为增强项。

MVP 不强制实时更新，可以刷新页面查看结果。

---

## 12. 项目命名

项目名：

```text
DeerGraph
```

中文名：

```text
DeerFlow 多智能体运行图谱
```

英文描述：

```text
A visual runtime graph for DeerFlow multi-agent execution.
```

页面名：

```text
Agent Graph
```

API namespace：

```text
/api/visual
```

---

## 13. 阶段性成品清单

| 阶段 | 成品 | 可演示程度 |
|---|---|---|
| 阶段 0 | 设计文档、事件清单 | 不能演示，但能指导开发 |
| 阶段 1 | 后端 graph snapshot JSON | 可用 API 演示 |
| 阶段 2 | subagent 生命周期事件 | 可在 JSON 中看到子 Agent |
| 阶段 3 | 静态前端图谱页面 | 可在浏览器看到点线图 |
| 阶段 4 | 实时图谱更新 | 可演示运行中节点变化 |
| 阶段 5 | 交互增强 | 用户可读性明显提升 |
| 阶段 6 | 文档/截图/演示脚本 | 可交付展示 |

---

## 14. 给 Claude Code 的第一条任务建议

> 请先执行阶段 0：阅读 DeerFlow runtime 与 frontend 结构，输出 `docs/plans/2026-05-31-agent-graph-visualizer-design.md`。不要写功能代码。设计文档必须包含：现有事件源、需要新增的事件、API router 插入点、前端页面插入点、测试计划、风险点、需要 OpenClaw 共同讨论的架构问题。完成后等待 OpenClaw 审查。

建议直接发给 Claude Code：

```text
请阅读 C:\Users\hjl\Projects\deer-flow\docs\plans\2026-05-31-agent-graph-visualizer-plan.md。

这个项目现在命名为 DeerGraph，中文名是 DeerFlow 多智能体运行图谱。目标是在 DeerFlow 运行复杂任务时，把主 Agent、子 Agent、工具调用、结果回流画成类似知识图谱/数据结构图的可视化运行界面。

请先只执行阶段 0：需求冻结与代码勘探。

要求：
1. 不要写功能代码。
2. 先阅读计划书第 9 节 OpenClaw × Claude Code 协作协议。
3. 勘探 DeerFlow runtime、RunJournal、RunEventStore、SubagentExecutor、lead_agent、frontend chat 页面。
4. 输出 docs/plans/2026-05-31-agent-graph-visualizer-design.md。
5. 设计文档必须包含：
   - 现有事件源清单
   - 现有事件是否足够生成图谱
   - 需要新增的 subagent/tool/agent 事件
   - API router 插入点
   - 前端页面或 Tab 插入点
   - 测试计划
   - 风险点
   - 需要和 OpenClaw 共同讨论的问题
6. 同时创建或更新 docs/plans/deergraph-adr.md，先记录待决策 ADR，不要强行定论。
7. 完成后暂停，等待 OpenClaw 审查，不要进入阶段 1 实现。
```

