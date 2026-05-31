# DeerGraph 阶段 1 OpenClaw 审查

日期：2026-05-31  
阶段：Stage 1 — Graph Core Snapshot  
审查对象：Claude Code 阶段 1 交付物

## 1. 审查结论

**通过。**

阶段 1 符合 OpenClaw 在阶段 0 审查中限定的范围：只做后端只读 Graph Core Snapshot，没有做前端、SSE、polling、realtime、`task_*` 落库，也没有修改 `task_tool.py`、`worker.py` 或 `RunEventStore` 契约。

测试已由 OpenClaw 复跑：

```powershell
cd C:\Users\hjl\Projects\deer-flow\backend
uv run python -m pytest tests/test_graph_sanitizer.py tests/test_graph_event_mapper.py tests/test_graph_builder.py tests/test_visual_runs_router.py -q
```

结果：

```text
55 passed, 1 warning in 1.87s
```

额外验证：

```powershell
uv run python -c "from app.gateway.app import create_app; app = create_app(); print('app ok', len(app.routes))"
```

结果：

```text
app ok 90
```

说明 router 注册后应用可正常创建。

---

## 2. 范围核对

### 2.1 已新增 / 修改的阶段 1 相关文件

核心实现：

```text
backend/packages/harness/deerflow/runtime/graph/__init__.py
backend/packages/harness/deerflow/runtime/graph/models.py
backend/packages/harness/deerflow/runtime/graph/sanitizer.py
backend/packages/harness/deerflow/runtime/graph/event_mapper.py
backend/packages/harness/deerflow/runtime/graph/builder.py
backend/app/gateway/routers/visual_runs.py
backend/app/gateway/app.py
backend/app/gateway/routers/__init__.py
```

测试：

```text
backend/tests/test_graph_sanitizer.py
backend/tests/test_graph_event_mapper.py
backend/tests/test_graph_builder.py
backend/tests/test_visual_runs_router.py
```

### 2.2 禁止改动项核对

以下阶段 1 禁止项未被修改：

```text
backend/packages/harness/deerflow/tools/builtins/task_tool.py
backend/packages/harness/deerflow/runtime/runs/worker.py
backend/packages/harness/deerflow/runtime/events/store/base.py
backend/packages/harness/deerflow/runtime/events/store/jsonl.py
backend/packages/harness/deerflow/runtime/events/store/memory.py
```

`git diff` 对这些路径无输出，符合范围约束。

### 2.3 未做项核对

符合阶段 1 限制：

- 未做前端。
- 未做 SSE。
- 未做 polling。
- 未做 realtime。
- 未落库 `task_*`。
- 未修改 `RunEventStore` 契约。
- mock 仅用于 auth 测试夹具；产品路径使用 `MemoryRunEventStore` / `RunEventStore` 语义。

---

## 3. 交付物审查

## 3.1 models.py

结论：**通过。**

优点：

- `GraphNode`、`GraphEdge`、`GraphSnapshot` 与阶段计划中的数据结构对齐。
- `to_dict()` 输出 camelCase。
- optional `None` 字段被省略。
- `metadata` 为空时省略。
- `GraphSnapshot` 保留 `version`、`truncated`、`updatedAt`。

注意：

- `GraphSnapshot.truncated` 即使为 `False` 也输出，这符合 API 明确性要求。

## 3.2 sanitizer.py

结论：**通过，后续可增强。**

优点：

- 实现三层脱敏：敏感 key、密钥正则、head/tail 截断。
- 支持嵌套 dict/list。
- 失败时返回 `[REDACTED]`，符合 best-effort 原则。
- 覆盖 OpenAI/GitHub/AWS/Bearer/Slack/inline key=value 等常见形态。

非阻塞建议：

- 后续可增加更多真实国产云/国内平台 token 形态，例如 `AK/SK`、`LTAI...`、`eyJ...` JWT 单独出现等。
- `session_id`、`cookie_*` 这类 compound key 是否应默认脱敏，可在阶段 5 或安全增强中再补。

## 3.3 event_mapper.py

结论：**通过。**

优点：

- mapper 是纯函数/轻状态函数，无 IO。
- 支持 `llm.human.input` -> User。
- 支持 `llm.ai.response.tool_calls[name=task]` -> Subagent。
- 使用 `tool_call_id` / call id 作为 correlation id。
- 支持 `llm.tool.result` -> returns edge。
- orphan result 不抛错。
- subagent/middleware caller 被排除，不展开 subagent 内部工具，符合 MVP 深度。
- final AIMessage 和 run.error 节点处理符合阶段 0 审查要求。

非阻塞建议：

- 后续真实样本多了以后，最好加入基于真实 RunJournal dump 的 fixture，避免 LangChain 序列化字段形态变化造成漏识别。

## 3.4 builder.py

结论：**通过。**

优点：

- 使用 `list_messages_by_run(..., after_seq=...)` 游标分页聚合，未修改 store 契约。
- 单独补查 `run.end` / `run.error`。
- 达到 `max_events` 后设置 `truncated=true`。
- 单条坏事件被跳过，不会拖垮整个 snapshot。
- 支持多 subagent。
- 支持 failed tool result 标记 subagent failed。
- 支持 run.error 生成 failed final。
- 输出稳定，重复 build 节点/边一致。

非阻塞建议：

- `_collect_messages` 如果 store 层整体异常会抛出，目前由 API router 捕获并降级为空图；这符合 API 不 500 的要求。但如果以后 builder 被 API 之外调用，可考虑 builder 内部也捕获 store 读取异常并返回空图 + metadata warning。
- `truncated=true` 当前只是布尔标记，后续可以加 `metadata.eventsScanned/eventsLimit` 方便前端提示。

## 3.5 visual_runs.py

结论：**通过。**

优点：

- 路径符合审查决定：`GET /api/visual/runs/{thread_id}/{run_id}/graph`。
- 使用 `get_run_event_store(request)`。
- 使用 `@require_permission("runs", "read", owner_check=True)`。
- 构图失败降级为空 `GraphSnapshot`，避免 500。
- app 创建验证通过。

测试覆盖：

- populated run 返回 200 + camelCase snapshot。
- empty run 返回空图，不 500。
- owner_check denied 返回 404。

---

## 4. 风险与后续注意事项

### 4.1 提交卫生

当前仓库中还有一些与阶段 1 无关的未跟踪文件，例如此前 DeerFlow 本地控制台、LangGraph Studio、OpenClaw 工作区文件等。后续 commit 时不要 `git add .`，应只添加 DeerGraph 阶段 1 相关文件。

建议只提交：

```text
backend/packages/harness/deerflow/runtime/graph/
backend/app/gateway/routers/visual_runs.py
backend/app/gateway/app.py
backend/app/gateway/routers/__init__.py
backend/tests/test_graph_sanitizer.py
backend/tests/test_graph_event_mapper.py
backend/tests/test_graph_builder.py
backend/tests/test_visual_runs_router.py
相关 docs/plans 文件
```

### 4.2 真实运行样本验证

阶段 1 测试用了 RunJournal-shaped fixtures + MemoryRunEventStore，已满足当前验收。但进入阶段 3 前，建议补一次真实 DeerFlow run 的快照验证：

1. 在 DeerFlow Web UI 或控制台跑一个会触发 `task` 的任务。
2. 取 `thread_id` / `run_id`。
3. 调用 `/api/visual/runs/{thread_id}/{run_id}/graph`。
4. 确认真实输出包含 User、Lead、Subagent、Final。

这不是阶段 1 阻塞项，但建议作为阶段 3 前置 smoke test。

### 4.3 阶段 2 不要急着落库

阶段 1 已经证明 snapshot MVP 能基于现有持久化事件成立。阶段 2 仍应遵守阶段 0 裁定：先做 `task_* -> GraphDelta/status` 纯映射设计与测试；落库作为 2B 可选增强，不要直接改 `task_tool.py` 或 worker。

---

## 5. 阶段 1 验收结论

**Stage 1 accepted.**

可进入下一阶段。

推荐下一步不是直接做 realtime，而是先决定阶段 2 / 阶段 3 顺序：

- 如果目标是尽快看到图：进入阶段 3，做前端静态图谱页面，接阶段 1 snapshot API。
- 如果目标是先让状态更准：进入阶段 2A，做 `task_*` 生命周期事件到图谱状态/GraphDelta 的纯映射测试，不落库、不接实时。

OpenClaw 推荐：**先进入阶段 3。**

理由：阶段 1 已有真实 snapshot 数据，用户现在最需要确认“图形化视图长什么样、是否接近马威斯式节点图”。状态和实时可以后补；如果继续在后端打磨太久，产品反馈会太晚。

---

## 6. 给 Claude Code 的下一条建议任务

```text
请执行 DeerGraph 阶段 3：Frontend Static Graph。

依据文件：
- docs/plans/2026-05-31-deergraph-joint-plan.md
- docs/plans/2026-05-31-deergraph-design.md
- docs/plans/2026-05-31-deergraph-openclaw-review.md
- docs/plans/2026-05-31-deergraph-stage1-openclaw-review.md
- docs/plans/deergraph-adr.md

范围限制：
1. 只做前端静态图谱页面，接阶段 1 snapshot API。
2. 不做 SSE/polling/realtime。
3. 不改 task_tool.py / worker.py / RunEventStore。
4. 不落库 task_*。
5. 不重构聊天页；先做独立页面。
6. 可引入 React Flow / @xyflow/react，如已有依赖则复用。
7. 必须 TDD 或至少组件测试优先：先写 API client / hook / component 测试，再实现。

交付：
- AgentGraphCanvas / node / edge / details panel 基础组件
- useAgentGraph 或 API client
- 独立图谱页面路由
- 空状态 / 加载 / 错误状态
- 用 fixture 或 mock server 测试组件，但页面实际数据路径必须调用真实 snapshot API
- 测试命令与结果

完成后停止，等待 OpenClaw 审查。
```
