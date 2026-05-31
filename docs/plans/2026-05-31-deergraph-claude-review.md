# DeerGraph Claude Code 计划书审查纪要

日期：2026-05-31
角色：Claude Code 作为 DeerFlow 代码实现者，对 OpenClaw 初版计划书进行审查。

## 核心结论

子 Agent 不是在主链路 callback 中运行。`SubagentExecutor` 会把子 Agent 提交到独立常驻事件循环线程，子 Agent 内部目前主要使用自己的 `SubagentTokenCollector` 回调收集 token，不写 `RunEventStore`。

因此：

- `RunJournal` 目前主要捕获主图根上的事件。
- 主 Agent 调用 `task(...)` 通常只会在主 run 中留下 `task` 工具调用相关事件。
- 子 Agent 内部 LLM 调用、工具调用当前不会自然出现在 RunEventStore 中。
- 如果 DeerGraph 要展示真正的多 Agent 图谱，必须补齐 subagent 生命周期事件。

## 对计划书的主要修订建议

1. 阶段顺序应调整：子 Agent 生命周期事件不能太晚，否则前端阶段会先做出“单 Agent + task 工具”的假多 Agent 图。
2. 阶段 1 应定义为 graph 数据模型、mapper、snapshot API 的最小闭环。
3. 阶段 2 应尽早补齐 `subagent.spawn/start/finish/error` 事件，然后再做前端静态图谱。
4. 子 Agent 内部工具展开是高风险点，因为涉及跨线程/跨 loop 写事件；MVP 可先只做 task 层包裹，展示 `Lead Agent -> Subagent -> Lead Agent`。
5. 工具节点不能只依赖 `llm.tool.result`；工具名和输入可能需要从前一条 `llm.ai.response` 的 tool_calls 里按 tool_call_id 关联。
6. 实时更新优先复用 DeerFlow 现有 run 事件/SSE 基础设施；MVP 可先 polling snapshot，避免重复造流式栈。
7. 前端入口建议“聊天页 Agent Graph Tab 为主，独立 graph 路由为辅”，两者复用同一组件。
8. 必须加入事件写入串行化/失败吞掉/敏感信息脱敏规则，避免观测能力破坏主任务。

## Claude Code 建议阶段 0 必看文件

```text
backend/packages/harness/deerflow/runtime/journal.py
backend/packages/harness/deerflow/runtime/events/store/base.py
backend/packages/harness/deerflow/runtime/events/store/db.py
backend/packages/harness/deerflow/subagents/executor.py
backend/packages/harness/deerflow/subagents/token_collector.py
backend/packages/harness/deerflow/tools/ 或 task 工具实现位置
backend/packages/harness/deerflow/runtime/runs/worker.py
backend/packages/harness/deerflow/runtime/stream_bridge/*
backend/packages/harness/deerflow/agents/lead_agent/agent.py
backend/app/gateway/app.py
backend/app/gateway/routers/*
frontend/src/app/workspace/chats/[thread_id]/page.tsx
frontend/src/app/workspace/chats/[thread_id]/layout.tsx
frontend/package.json
```

## 需要 OpenClaw/用户确认的问题

1. MVP 是否只要求看到 `Lead Agent -> Subagent -> Lead Agent`，还是必须展开到 `Subagent -> Tool`？
2. 是否接受后续向 `SubagentExecutor` 注入 `run_id` 与 event writer，以换取完整子 Agent 内部事件？
3. 实时机制是否同意先 snapshot/polling，再复用现有 SSE，而不是新建 WebSocket？
4. 前端入口是否确定为聊天页 Tab + 独立全屏路由复用组件？
5. 历史 run 是否需要补图谱，还是只保证新 run 可视化？
