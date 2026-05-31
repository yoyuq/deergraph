# DeerGraph 阶段 0 设计勘探报告

> 本文件是 DeerGraph 阶段 0（共同设计勘探）的交付物。
> 它把共同计划书中的假设逐条对照 DeerFlow 真实代码进行核实，冻结事件源、API、前端入口、阶段边界与脱敏策略。
> **本阶段不写任何功能代码。** 文中所有结论均带 `文件:行号` 来源。

- 基座项目：`C:\Users\hjl\Projects\deer-flow`
- 勘探日期：2026-05-31
- 对应计划书：`docs/plans/2026-05-31-deergraph-joint-plan.md`
- 配套讨论纪要：`docs/plans/2026-05-31-deergraph-dialogue-summary.md`

---

## 0. 勘探结论速览（与计划书的差异）

| # | 计划书假设 | 代码核实结果 | 状态 |
|---|---|---|---|
| 1 | snapshot API 用 `/api/visual/...` | `/api/visual` 当前**不存在**；现有 run 级端点全部挂在 `/api/threads/{thread_id}/runs/{run_id}/...` | ⚠️ 需决策（见 §1） |
| 2 | 聊天页有 `Chat \| Files \| Agent Graph` Tab 栏 | 聊天页**没有 Tab 栏**；是 `ResizablePanelGroup`（chat + artifacts 两个可调面板） | ❗ 计划书假设有误（见 §2） |
| 3 | MVP 可由现有持久化事件还原 | **成立**。事件类型与字段全部核实通过 | ✅ 确认（见 §3） |
| 4 | `task_*` 进 custom stream、不落库 | **成立**。`task_id == tool_call_id`，是关键关联键 | ✅ 确认（见 §4） |
| 5 | `list_events` 默认 `limit=500` | **成立**（base.py:74）。无 `after_seq` 游标，仅 `list_messages` 有游标 | ✅ 确认（见 §5） |
| 6 | 需要 sanitizer 脱敏 + 截断 | 截断有现成约定可复用；**secret 脱敏完全没有，需从零设计** | ✅ 确认（见 §6） |
| 7 | `emitter.py seq bug` | 未找到 `emitter.py`；seq 由 store 按 thread 分配，严格单调 | ✅ 不作为风险 |

---

## 1. Graph Snapshot API Router 位置

### 1.1 现状（已核实）

- 路由注册集中在 `backend/app/gateway/app.py:332-376`，通过 `app.include_router(...)` 挂载，前缀写在各 router 模块内部。
- 现有 run 级端点：
  - `GET /api/threads/{thread_id}/runs/{run_id}/events` — `thread_runs.py:410`，**已经读 `RunEventStore`**（`thread_runs.py:420`）。
  - `GET /api/threads/{thread_id}/runs/{run_id}` — `thread_runs.py:211`
  - `GET /api/runs/{run_id}/messages` — `runs.py:105`，也读 `RunEventStore`（`runs.py:124`）。
  - feedback 嵌套：`/api/threads/{thread_id}/runs/{run_id}/feedback` — `feedback.py`，注册于 `app.py:370`。
- **当前代码库不存在 `/api/visual` 或 `/api/langgraph` 前缀。**
- `RunEventStore` 通过 FastAPI 依赖注入获取：`get_run_event_store(request)`（`deps.py`，由 `app.state.run_event_store` 提供，`deps.py:162` 初始化）。
- 鉴权用装饰器 `@require_permission("runs", "read", owner_check=True)`（参考 `thread_runs.py:212`）；`owner_check=True` 需要路径里有 `thread_id`。

### 1.2 决策（冻结）

新增独立 router 文件 `backend/app/gateway/routers/visual_runs.py`，并在 `app.py:370` 附近（feedback 之后）`include_router`。

**端点路径采用计划书首选：**

```text
GET /api/visual/runs/{thread_id}/{run_id}/graph
```

```python
# 形态（设计示意，阶段 1 实现）
router = APIRouter(prefix="/api/visual", tags=["visual"])

@router.get("/runs/{thread_id}/{run_id}/graph")
@require_permission("runs", "read", owner_check=True)
async def get_run_graph(thread_id: str, run_id: str, request: Request): ...
```

理由：

- 保留计划书与 ADR-1 的命名意图：DeerGraph 是产品可视化能力，独立命名空间避免污染 LangGraph 兼容接口（`assistants_compat.py` / `thread_runs.py`）。
- 路径里保留 `{thread_id}`，满足 `@require_permission(owner_check=True)` 的归属校验约定。
- store 访问、鉴权、router 结构全部沿用 feedback.py 既有模式，零新基础设施。

**记录在案的张力（提请 OpenClaw 注意）：** 现有所有 run 级资源都嵌在 `/api/threads/{thread_id}/runs/{run_id}/...` 下（events、feedback）。`/api/visual/runs/...` 是**唯一一处脱离该约定**的端点。替代方案 B 是顺从既有约定用 `/api/threads/{thread_id}/runs/{run_id}/graph`。本设计选 A（`/api/visual`）以贯彻"产品可视化独立命名空间"决策，但这是一个可被 OpenClaw 推翻的取舍点。后续扩展端点同样落在 `/api/visual` 下：

```text
GET /api/visual/runs/{thread_id}/{run_id}/graph/delta   # 阶段 4
```

---

## 2. 前端独立图谱页面路径 + 聊天页插入点

### 2.1 依赖与版本（已核实，`frontend/package.json`）

- `@xyflow/react`：`^12.10.0`（**已安装**，line 54）— 阶段 3 无需新增依赖。
- Next.js：`^16.2.6`（line 71，App Router）。
- React：`^19.0.0`（line 77）。
- `@radix-ui/react-tabs`：`^1.1.13`（line 43，若决定引入 Tab 可用）。

### 2.2 独立图谱页面路径（冻结）

现状路由树：

```text
frontend/src/app/workspace/chats/
  page.tsx
  [thread_id]/
    page.tsx        # 当前聊天页 URL: /workspace/chats/{thread_id}
    layout.tsx
    providers.tsx
```

`run_id` **当前不在任何路由段中**，也不存在 `runs/` 段。新增独立页面需创建：

```text
frontend/src/app/workspace/chats/[thread_id]/runs/[run_id]/graph/page.tsx
→ URL: /workspace/chats/{thread_id}/runs/{run_id}/graph
```

阶段 3 交付此独立全屏页面（符合 ADR-2 的"独立全屏路由为辅"）。

### 2.3 聊天页"Tab 插入点"——计划书假设需修正 ❗

核实 `frontend/src/components/workspace/chats/chat-box.tsx:104-176`：聊天页**没有 `Chat | Files | Agent Graph` Tab 栏**。实际结构是水平 `ResizablePanelGroup`：

```text
ResizablePanelGroup (horizontal)            # chat-box.tsx:104
├── ResizablePanel id="chat"     defaultSize=100   # line 110，渲染 {children}
├── ResizableHandle                                # line 113
└── ResizablePanel id="artifacts"                  # line 120，受 artifactsOpen 控制
```

artifacts 面板（line 120-175）通过 `artifactPanelOpen` 状态开合，里面渲染 `ArtifactFileDetail` / `ArtifactFileList`。

**因此阶段 4 的"聊天页插入点"不是往 Tab 栏加一项，而是二选一：**

- **方案 4A（推荐，低风险）：** 复用 artifacts 这类侧边 `ResizablePanel` 模式，新增第三个 `ResizablePanel id="agent-graph"`，由一个 `agentGraphOpen` 状态控制开合，内部挂 `AgentGraphCanvas`。与现有面板机制同构，对聊天主链路改动最小。
- **方案 4B：** 先把聊天区重构成真正的 Tab（用已安装的 `@radix-ui/react-tabs`），再加 `Agent Graph` Tab。改动面更大、风险更高，与计划书原文最贴合但不推荐在 MVP 期做。

阶段 0 冻结：**采用 4A**。计划书 §"前端入口"中 `Chat | Files | Agent Graph` 的描述应理解为"在聊天页提供一个可切换的图谱视图区"，而非字面的 Tab 组件。ADR-2 据此更新。

### 2.4 API client 约定（阶段 3 沿用）

约定见 `frontend/src/core/api/feedback.ts:11-28`：具名导出函数，`getBackendBaseURL()` 拼 URL，路径参数 `encodeURIComponent()`，`fetch` 封装。新增 `frontend/src/core/api/agent-graph.ts` 照此实现，请求 `/api/visual/runs/{threadId}/{runId}/graph`。

---

## 3. 现有持久化事件如何生成 MVP 图谱（已核实）

### 3.1 RunEvent 数据模型

持久化行模型 `backend/packages/harness/deerflow/persistence/models/run_event.py:13-35`，store 接口 dict 形态 `runtime/events/store/base.py:29-39`。关键字段：

```text
thread_id, run_id, user_id, event_type, category,
content (str | dict, JSON), metadata, seq, created_at
```

### 3.2 RunJournal 实际发出的事件类型（`runtime/journal.py`）

| 事件类型 | 行号 | category | 触发回调 |
|---|---|---|---|
| `run.start` | 159 | trace | `on_chain_start`（parent_run_id is None 时）|
| `run.end` | 166 | outputs | `on_chain_end` |
| `run.error` | 171 | error | `on_chain_error` |
| `llm.human.input` | 216 | message | `on_chat_model_start`（取首个 HumanMessage）|
| `llm.ai.response` | 270 | message | `on_llm_end`（每个 AIMessage generation）|
| `llm.error` | 312 | trace | `on_llm_error` |
| `llm.tool.result` | 324 / 331 | message | `on_tool_end`（ToolMessage / Command）|
| `middleware:{tag}` | 480 | middleware | `record_middleware()`（tag 动态）|

> RunJournal 是 LangChain BaseCallbackHandler，**只消费 callback**，不消费 LangGraph custom stream。故 `task_*` 生命周期事件不在此列（见 §4）。

### 3.3 tool_call 与 tool_call_id 的表示

- `llm.ai.response.content` 由 `message.model_dump()` 序列化（`journal.py:272`），其中 `content["tool_calls"]` 是数组，每项含 `name` / `id` / `args`。找 subagent：遍历数组取 `name == "task"`，其 `id` 即 `tool_call_id`。
- `llm.tool.result.content` 由 `ToolMessage.model_dump()` 序列化（`journal.py:323`），含 `tool_call_id`，与上面的 `id` 配对。

### 3.4 MVP 图谱构建映射（阶段 1 builder 据此实现）

| 图元 | 来源事件 | 关联键 |
|---|---|---|
| User 节点 + `User→Lead` 边(input) | `llm.human.input` | — |
| Lead Agent 节点 | `run.start` / `llm.ai.response`(caller==lead) | — |
| Subagent 节点 + `Lead→Subagent` 边(delegates) | `llm.ai.response` 中 `tool_calls[name=="task"]` | `tool_call_id` |
| `Subagent→Lead` 返回边(returns) | `llm.tool.result` 按 `tool_call_id` 配对 | `tool_call_id` |
| Final 节点 + `Lead→Final` 边(produces) | `run.end` + 最后一条无 tool_calls 的 lead AIMessage | — |

阶段 1 即可产出真实非 mock 静态 snapshot。普通（非 task）tool 节点 MVP 折叠。

---

## 4. `task_*` custom stream 如何在阶段 2/4 被 graph 消费（已核实）

### 4.1 事件源（`tools/builtins/task_tool.py`）

经 `get_stream_writer()` 实时发出，**全部核实通过**：

| 事件 | 行号 | payload 关键字段 |
|---|---|---|
| `task_started` | 329 | `task_id`, `description` |
| `task_running` | 353 | `task_id`, `message`, `message_index`, `total_messages` |
| `task_completed` | 370 | `task_id`, `result`, `usage` |
| `task_failed` | 377 | `task_id`, `error`, `usage` |
| `task_cancelled` | 384 | `task_id`, `error`, `usage` |
| `task_timed_out` | 391 | `task_id`, `error`, `usage` |

### 4.2 关键关联事实

- `tool_call_id` 由 `InjectedToolCallId` 注入（`task_tool.py:192`）。
- **`task_id` 直接 == `tool_call_id`**（`task_tool.py:316`：`executor.execute_async(prompt, task_id=tool_call_id)`）。

> 这是 DeerGraph 的核心关联键：`task_*` 事件的 `task_id`、`llm.ai.response` 里的 `task` tool_call `id`、`llm.tool.result` 的 `tool_call_id`**三者同值**。subagent 节点的静态结构（§3）与生命周期状态（§4）天然用同一个 id 对齐，无需另造 correlation id。

### 4.3 当前传播链路（已核实）

- subagent 在**隔离事件循环/线程**中运行（`subagents/executor.py`，`_isolated_subagent_loop` 全局守护线程），其内部 LangChain astream 事件**不会**自然流入父 `RunEventStore`。
- worker 消费 LangGraph 流并 publish 到 StreamBridge：`runtime/runs/worker.py:311-334`；run 结束 publish END_SENTINEL（`worker.py:427`）；RunJournal 在 `worker.py:393-397` flush。
- StreamBridge 是独立 pub/sub：`stream_bridge/base.py` `publish`(41-46)/`subscribe`(49-61)；SSE 端点 `POST /api/runs/stream`（`runs.py:34`）经 `sse_consumer`（services.py:373-405）下发。
- **结论：`task_*` 当前是实时 only，不落库。**

### 4.4 阶段 2/4 消费方案（冻结方向，阶段 2 再细化实现）

复用现有 `task_*` 语义，**不新造 `subagent.*` 词汇表**（计划书 §1.4 共识）。两条互补路径：

- **阶段 4（近实时 / 优先）：** 前端经现有 SSE（`/api/runs/stream`）订阅 run 事件流；前端/后端 delta 层从 `task_*` 事件按 `task_id` 找到对应 subagent 节点，转成 `GraphDelta`（`node.update` 改 status：started→running、completed→completed、failed/cancelled/timed_out→对应状态）。复用现有 StreamBridge/SSE，不新建 WebSocket，不新建 `/graph/stream`（除非被证明不够用）。
- **阶段 2（持久化 / 可选增强）：** 若需要刷新后仍能看到历史生命周期状态，则 best-effort 把 `task_*` 落 `RunEventStore`。**注入点选择（提请 OpenClaw 定夺）：**
  - 推荐：在 worker 消费 LangGraph custom stream 处（`worker.py` 流消费段）统一旁路写 store，与 RunJournal flush 同区域，集中管理 seq/flush/异常吞掉。
  - 不推荐：在 `task_tool.py` 内直接绕过 RunJournal 写 store（计划书 §阶段2 已明确反对，会分散 seq/flush/错误语义）。
- 任何写入/delta 失败必须 best-effort 吞掉并记日志，**不得中断主任务**（计划书 §1.6）。

---

## 5. `list_events` 截断处理方案（已核实）

### 5.1 现状

`runtime/events/store/base.py:68-79`：

```python
async def list_events(self, thread_id, run_id, *,
                      event_types: list[str] | None = None,
                      limit: int = 500) -> list[dict]:
```

- **默认 `limit=500`**（line 74）确认。
- `list_events` **无游标参数**（无 `after_seq`/`before_seq`），按 `seq` 升序返回前 `limit` 条。
- 只有 `list_messages`（`base.py:51-65`）有双向游标 `before_seq` / `after_seq`。
- `seq` 由 store 按 `thread_id` 严格单调分配（memory.py:19-23；jsonl.py:64-66；db 用 advisory lock 无空洞）。**按 thread 单调，非按 run。**

### 5.2 决策（冻结）

阶段 1 graph builder 读取一个 run 的全部事件时，采用**游标分页聚合 + 显式 truncated 标志**：

1. builder 内部循环拉取，用上一批最后的 `seq` 作为游标继续拉，直到该 run 无更多事件。由于 `list_events` 无 `after_seq`，阶段 1 实现二选一：
   - **优先：** builder 复用 `list_messages` 的 `after_seq` 游标做分页（MVP 图元几乎全是 message 类：human.input / ai.response / tool.result），按需补一次 `run.end`。
   - 备选：给 `list_events` 增加 `after_seq` 参数（小改动，需 OpenClaw 批准动 store 契约）。
2. 设安全上限（如累计 N 条事件）。命中上限时停止聚合，并在 `GraphSnapshot.truncated = true` 标记，前端展示"图谱可能不完整"。
3. 绝不静默丢事件——要么取全，要么明确 `truncated=true`。

> 阶段 0 不改任何代码。上述为阶段 1 实现约束。是否扩展 `list_events` 签名，留作阶段 1 评审项。

---

## 6. Sanitizer 规则（已核实现状 + 冻结规则）

### 6.1 现状（已核实）

- **截断有现成约定可复用：**
  - `ToolOutputBudgetMiddleware`（`agents/middlewares/tool_output_budget_middleware.py`）：head+tail 截断、`_snap_to_line_boundary()` 按行边界对齐、超阈值外置到磁盘。
  - `ToolOutputConfig`（`config/tool_output_config.py`）：`preview_head_chars=2000`、`preview_tail_chars=1000`、`fallback_max_chars=30000` 等。
  - `DbRunEventStore`（`runtime/events/store/db.py:52-60`）：trace 内容按 `max_trace_content`（默认 10240 字节）截断，并写 `content_truncated` / `original_byte_length` 元数据标志。
- **secret 脱敏：完全不存在。** 全仓未找到 redact/sanitize/mask secret 的正则或字段名单。事件存储层不做任何字段级过滤，tool input/output 原文落库。
  - 含义：DeerGraph snapshot 若直接回显 `llm.ai.response` 的 tool args 或 `llm.tool.result` 的 content，**有泄露原始密钥/凭据的真实风险**，必须由 sanitizer 兜底。

### 6.2 Sanitizer 规则（冻结，阶段 1 实现，对应 ADR-6）

`runtime/graph/sanitizer.py` 在事件→图元映射时、写入 snapshot 之前对所有 `summary`/`inputPreview`/`outputPreview`/`error`/`label` 字段执行：

1. **默认只出摘要预览，不出原文。** 任何预览字段先截断：复用 head+tail 约定，默认 `preview_head≈500` / `preview_tail≈200` 字符，按行边界对齐；超限标记省略尾注 `[... N chars omitted ...]`。原始全文**不进入** snapshot。
2. **字段名脱敏（key-based）。** 对 tool args / metadata 的字典键名做大小写不敏感匹配，命中即把值整体替换为 `[REDACTED]`。名单（初版）：
   ```text
   password, passwd, secret, token, api_key, apikey, access_key,
   secret_key, authorization, auth, bearer, credential(s),
   private_key, session, cookie, refresh_token, client_secret
   ```
3. **值模式脱敏（value-based 正则）。** 对所有要进 snapshot 的文本扫描并替换：
   ```text
   - Bearer / Authorization 头：  (?i)bearer\s+[A-Za-z0-9._\-]+        → "Bearer [REDACTED]"
   - 常见 key 前缀：             sk-[A-Za-z0-9]{16,}, ghp_…, AKIA[0-9A-Z]{16}, xox[baprs]-… 等 → "[REDACTED]"
   - 形如 key=value 的内联秘密：  (?i)(api[_-]?key|token|secret|password)\s*[=:]\s*\S+ → 键名保留、值 "[REDACTED]"
   ```
4. **统一替换标记用 `[REDACTED]`**（与现有 `content_truncated` 元数据风格一致；不用 `***`）。
5. **best-effort：** sanitizer 自身异常不得中断图谱构建，更不得影响主任务——异常时该字段降级为空串/占位并记日志。
6. 规则集做成可配置常量（名单 + 正则表），便于阶段评审增删，不硬编码散落各处。

> 截断阈值与 `ToolOutputConfig` 解耦：snapshot 预览远短于 tool 输出预算，单独定义 graph 自己的 preview 常量，避免误用大阈值导致一屏塞满原文。

---

## 7. 阶段边界冻结（供后续阶段引用）

- **阶段 1（Graph Core Snapshot）：** 纯只读旁路。新增 `runtime/graph/{models,sanitizer,event_mapper,builder}.py` + `routers/visual_runs.py`。仅消费 §3 的持久化事件。交付 `GET /api/visual/runs/{thread_id}/{run_id}/graph`。
- **阶段 2（Task Lifecycle Enrichment）：** 复用 §4 的 `task_*` 语义丰富 subagent 状态；若落库则在 worker 旁路 best-effort 写 store。涉及写事件，审查标准与阶段 1 不同。
- **阶段 3（Frontend Static Graph）：** 用已装的 `@xyflow/react` 做独立页面 `/workspace/chats/{thread_id}/runs/{run_id}/graph`。
- **阶段 4（Chat 集成 + 近实时）：** 采用 §2.3 方案 4A（新增 `agent-graph` ResizablePanel，非 Tab）；实时先 SSE polling/订阅复用现有 StreamBridge。

---

## 8. 提请 OpenClaw / 用户确认的开放问题

1. **API 命名空间：** 确认采用 `/api/visual/runs/{thread_id}/{run_id}/graph`（方案 A，脱离 `/api/threads/...` 既有嵌套约定），还是改用 `/api/threads/{thread_id}/runs/{run_id}/graph`（方案 B，顺从约定）。本设计暂定 A。
2. **聊天页集成形态：** 确认采用 ResizablePanel 侧栏（4A，推荐），还是先把聊天区重构成 Radix Tabs（4B）。本设计暂定 4A。计划书"Tab"措辞据此调整。
3. **`list_events` 截断实现：** 阶段 1 是用 `list_messages` 游标聚合（不动 store 契约），还是给 `list_events` 增加 `after_seq` 参数（动契约）。本设计倾向前者。
4. **阶段 2 是否落库：** `task_*` 是仅做阶段 4 的实时 delta，还是也要 best-effort 落 `RunEventStore` 以支持刷新后回看历史状态。若落库，确认注入点在 worker 流消费段（推荐）。

---

## 9. 阶段 0 验收对照

| 验收标准（计划书 §阶段0）| 本文对应 | 结果 |
|---|---|---|
| 明确 graph snapshot API router 位置 | §1 | ✅ |
| 明确前端独立页面 + 聊天页插入点 | §2 | ✅（含计划书 Tab 假设修正）|
| 明确现有事件如何还原 MVP 图谱 | §3 | ✅ |
| 明确 `task_*` 如何被后续图谱消费 | §4 | ✅ |
| 明确 `list_events` limit=500 如何处理 | §5 | ✅ |
| 明确脱敏策略 | §6 | ✅ |
| 不写功能代码 | 全文 | ✅ |
