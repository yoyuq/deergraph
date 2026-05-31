# DeerGraph 阶段 0 OpenClaw 审查

日期：2026-05-31  
审查对象：

- `docs/plans/2026-05-31-deergraph-design.md`
- `docs/plans/deergraph-adr.md`
- Claude Code 阶段 0 代码勘探结论

审查结论：**阶段 0 通过，可进入阶段 1；但阶段 1 只允许做只读 snapshot MVP，不允许顺手做实时/落库/聊天页集成。**

---

## 1. 总体判断

阶段 0 达到了共同计划书要求：

- 没有写功能代码。
- 所有关键结论都对照真实代码核实，并带文件行号。
- 修正了两处计划书假设：
  1. 聊天页没有 Tab 栏，应改为 ResizablePanel 侧栏方案。
  2. 不新增 `subagent.*` 事件体系，复用现有 `task_*` 语义。
- 证明阶段 1 可以基于现有持久化事件实现真实非 mock MVP。
- 明确了阶段 1 / 2 / 3 / 4 的风险边界。

OpenClaw 认可该设计方向。

---

## 2. 对 4 个开放决策点的审查决定

### 决策 1：API 命名空间

阶段 0 提出两个候选：

- A. `/api/visual/runs/{thread_id}/{run_id}/graph`
- B. `/api/threads/{thread_id}/runs/{run_id}/graph`

OpenClaw 决定：**采用 A**。

理由：

- DeerGraph 是产品级可视化能力，不是 LangGraph 兼容 API，也不是通用 run event API。
- `/api/visual` 能清晰隔离后续 graph/delta/layout 等能力。
- 路径仍保留 `{thread_id}`，可以沿用 `@require_permission("runs", "read", owner_check=True)`。
- 虽然 A 脱离现有 `/api/threads/...` 嵌套习惯，但这是可接受的命名空间取舍。

阶段 1 实现约束：

```text
backend/app/gateway/routers/visual_runs.py
GET /api/visual/runs/{thread_id}/{run_id}/graph
```

并在 `backend/app/gateway/app.py` 中注册 router。

---

### 决策 2：聊天页集成形态

阶段 0 提出：

- 4A：新增 `ResizablePanel id="agent-graph"` 侧栏。
- 4B：重构聊天区为 Radix Tabs。

OpenClaw 决定：**采用 4A**。

理由：

- 当前聊天页真实结构是 `ResizablePanelGroup`，不是 Tab。
- 4A 与现有 artifacts 面板同构，侵入最小。
- 4B 会扩大改动面，MVP 阶段不值得。

阶段 3/4 实现约束：

- 阶段 3：先做独立页面，不碰聊天页。
- 阶段 4：再加 `agent-graph` ResizablePanel。
- 文档中“Agent Graph Tab”统一理解为“聊天页内可切换/可打开的图谱视图区”，不是字面 Tab 组件。

---

### 决策 3：`list_events` 截断处理

阶段 0 提出：

- A. 用 `list_messages_by_run` 游标聚合，不动 store 契约。
- B. 给 `list_events` 增加 `after_seq` 参数。

OpenClaw 决定：**阶段 1 采用 A，不动 store 契约。**

理由：

- 阶段 1 是只读 snapshot MVP，不应扩大到 store API 契约变更。
- MVP 核心图元主要来自 message 类事件：`llm.human.input`、`llm.ai.response`、`llm.tool.result`。
- `list_messages_by_run(thread_id, run_id, after_seq=...)` 已有游标能力。
- `run.end` 可额外通过 `list_events(..., event_types=["run.end", "run.error"], limit=10)` 获取；该类型数量极少，不存在 500 截断风险。

阶段 1 实现约束：

- Graph builder 先用 `list_messages_by_run` 分页聚合 message 事件。
- 再补查 `run.end` / `run.error`。
- 如果分页达到安全上限，返回 `truncated=true`。
- 不修改 `RunEventStore.list_events` 签名。

后续如果阶段 2 确认要持久化 `task_*` 并需要全事件分页，再单独评审是否给 `list_events` 增加游标。

---

### 决策 4：阶段 2 是否落库

阶段 0 提出：

- 仅用阶段 4 SSE 实时 delta。
- 或把 `task_*` best-effort 落 `RunEventStore`，支持刷新后回看生命周期状态。

OpenClaw 决定：**阶段 2 先不强制落库；阶段 2 目标改为设计并验证 `task_* -> GraphDelta/status` 映射，落库作为阶段 2B 可选增强。**

理由：

- 阶段 1 已能用持久化事件还原真实 MVP。
- `task_*` 当前是 custom stream，不落库是既有设计；强行落库会触碰 worker/store 语义，需要更严格审查。
- 用户首要目标是图形化理解多 Agent 运行过程，先把 snapshot 和前端跑通更重要。
- 刷新后历史生命周期细节确实有价值，但不是阶段 1/早期 MVP 的硬阻塞。

阶段边界调整：

- 阶段 2A：实现/测试 `task_*` 到 GraphDelta/status 的纯映射逻辑，仍不改 worker/store。
- 阶段 4：接现有 SSE，把实时 `task_*` 应用到前端图谱。
- 阶段 2B 或阶段 4 后：如用户要求“刷新后仍保留 running/failed/timeout 细节”，再评审 best-effort 落库；注入点只能在 worker 流消费段，不允许在 `task_tool.py` 直接绕过 RunJournal 写 store。

---

## 3. 对阶段 0 设计的修正/补充要求

### 3.1 阶段 1 不要依赖 `run.start`

阶段 1 的 Lead Agent 节点可以由以下信息稳定生成：

- 固定逻辑节点 `lead_agent`
- `llm.ai.response` 的存在
- run metadata

不要因为某些 run 缺 `run.start` 就不生成 Lead Agent 节点。

### 3.2 Final 节点识别要保守

Final 节点优先级：

1. 最后一条无 tool_calls 的 `llm.ai.response`。
2. 如果找不到，则用 `run.end` 生成一个摘要型 Final 节点。
3. 如果 run.error，则生成 Error/Failed Final 节点，不伪装成正常完成。

### 3.3 `task` tool_call 解析要兼容字段差异

阶段 1 mapper 不要假设 tool call 字段只有一种形态。至少兼容：

- `tool_call["name"] == "task"`
- `tool_call["id"]` 作为 correlation id
- 如 LangChain 序列化出现 `tool_call["type"]` / `tool_call["args"]` 差异，测试要覆盖。

### 3.4 `llm.tool.result` 配对失败不能报错

如果有 tool result 找不到对应 tool_call：

- 不抛异常。
- 可生成 orphan tool/result 节点，或忽略并记录 metadata warning。
- Snapshot API 必须稳定返回。

### 3.5 Sanitizer 是阶段 1 硬要求

阶段 1 不能先“裸返回内容以后再脱敏”。所有进入 snapshot 的字段必须经过 sanitizer。

---

## 4. 阶段 1 准入条件

Claude Code 可以进入阶段 1，但必须遵守：

1. 只实现后端只读 snapshot。
2. 不改 `task_tool.py`。
3. 不改 `worker.py`。
4. 不改 `RunEventStore` 契约。
5. 不做前端。
6. 不做 SSE / polling / realtime。
7. 不落库 `task_*`。
8. 不引入 mock 作为产品输出；mock 只能用于单元测试 fixture。
9. 必须先写测试，再实现。
10. 必须跑测试并给出命令结果。

---

## 5. 阶段 1 建议任务拆分

### Task 1：Graph models + sanitizer

文件建议：

```text
backend/packages/harness/deerflow/runtime/graph/models.py
backend/packages/harness/deerflow/runtime/graph/sanitizer.py
backend/tests/runtime/graph/test_sanitizer.py
```

验收：

- GraphSnapshot / GraphNode / GraphEdge 数据结构稳定。
- sanitizer 能脱敏 key-based 和 value-based secret。
- 长文本被 head+tail 截断。

### Task 2：Event mapper

文件建议：

```text
backend/packages/harness/deerflow/runtime/graph/event_mapper.py
backend/tests/runtime/graph/test_event_mapper.py
```

验收：

- human input -> User 节点。
- AIMessage task tool_call -> Subagent 节点 + delegates edge。
- tool_result with matching tool_call_id -> returns edge。
- final AIMessage -> Final 节点。
- orphan result 不崩。

### Task 3：Graph builder

文件建议：

```text
backend/packages/harness/deerflow/runtime/graph/builder.py
backend/tests/runtime/graph/test_builder.py
```

验收：

- 完整事件序列生成 `User -> Lead -> Subagent -> Lead -> Final`。
- 多个 task tool_call 能生成多个 subagent。
- run.error 生成失败状态。
- truncated 标志可测。

### Task 4：Snapshot API

文件建议：

```text
backend/app/gateway/routers/visual_runs.py
backend/app/gateway/app.py
backend/tests/gateway/test_visual_runs.py
```

验收：

- `GET /api/visual/runs/{thread_id}/{run_id}/graph` 返回 GraphSnapshot。
- 使用 `get_run_event_store(request)`。
- 使用 `@require_permission("runs", "read", owner_check=True)`。
- 空 run 返回空/最小图，不 500。

---

## 6. 审查结论

**通过。**

阶段 0 设计可信，且纠正了计划书中的两处错误假设。OpenClaw 同意进入阶段 1，但阶段 1 范围必须严格限制在“后端只读 Graph Core Snapshot”。

下一步建议发给 Claude Code：

```text
请执行 DeerGraph 阶段 1：Graph Core Snapshot。

依据文件：
- docs/plans/2026-05-31-deergraph-joint-plan.md
- docs/plans/2026-05-31-deergraph-design.md
- docs/plans/2026-05-31-deergraph-openclaw-review.md
- docs/plans/deergraph-adr.md

范围限制：
1. 只做后端只读 snapshot。
2. 不改 task_tool.py。
3. 不改 worker.py。
4. 不改 RunEventStore 契约。
5. 不做前端。
6. 不做 SSE/polling/realtime。
7. 不落库 task_*。
8. mock 只能用于测试 fixture，产品输出必须基于 RunEventStore 真实事件。
9. 必须 TDD：先写失败测试，再实现。

交付：
- runtime/graph models/sanitizer/event_mapper/builder
- /api/visual/runs/{thread_id}/{run_id}/graph
- 单元测试 + API 测试
- 测试命令与结果

完成后停止，等待 OpenClaw 审查。
```
