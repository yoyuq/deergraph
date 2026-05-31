# DeerGraph OpenClaw × Claude Code 多轮讨论纪要

日期：2026-05-31

## 用户修正

用户明确指出：希望 OpenClaw 与 Claude Code 对 DeerGraph 项目进行多轮交谈、讨论关键观点、达成一致后再给计划书；不是 Claude 出一份计划、OpenClaw 出一份计划再合并。

## Round 1：MVP 深度与 subagent 注入点

OpenClaw 观点：MVP 至少显示 `User -> Lead Agent -> Subagent -> Lead Agent -> Final`，不强制显示 subagent 内部 tool；优先在 task 工具层或主 run 安全位置补生命周期事件。

Claude Code 回应：同意。补充代码事实：
- task 工具层在主 run 事件循环上运行。
- runtime metadata 能拿到 run/thread 相关上下文。
- `tool_call_id` 可作为 task/subagent correlation id。
- 低侵入策略可行。

## Round 2：阶段 1 和阶段 2 是否合并

OpenClaw 提问：是否合并 graph core snapshot 与 subagent lifecycle？

Claude Code 回应：不合并，但阶段 1 必须预留 subagent 契约。

理由：
1. 阶段 1 是纯只读旁路，阶段 2 涉及写事件，风险不同。
2. 审查标准不同。
3. 阶段 1 可用现有事件和 mock 单测独立验收。

## Round 3：实时机制和前端入口

Claude Code 结论：
- MVP 用 snapshot + polling。
- 正式实时优先复用现有 SSE/StreamBridge，不新建 WebSocket。
- 前端入口采用“两者结合”：先独立路由，后聊天页 Tab，共享组件。

## Round 4：最终共识草案确认

OpenClaw 整理共识草案后，Claude Code 复核代码事实并提出关键修正：

1. MVP 最小图谱 `User -> Lead -> Subagent -> Lead -> Final` 已可由现有持久化事件还原。
2. 阶段 1 即可交付真实非 mock MVP。
3. 阶段 2 从“前置依赖”降级为“生命周期状态增强”。
4. 不应新造 `subagent.*` 事件词汇，优先复用现有 `task_*` 事件语义。
5. `task_*` 事件当前进入 custom stream/SSE，但不一定落库。
6. 未找到 `emitter.py seq bug`，不作为计划风险。
7. `list_events` 默认 limit=500，需要显式处理截断。
8. Final 节点建议由 `run.end` + 最后一条 lead agent AIMessage 共同识别。

## 最终产物

最终共同计划书：

```text
docs/plans/2026-05-31-deergraph-joint-plan.md
```

该文件是双方多轮讨论后的共同方案，不是简单合并版。
