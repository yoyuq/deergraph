# DeerGraph Demo Prompts

Prompts that reliably make a lead agent **fan out to ≥ 2 sub-agents** via the
`task` tool, so the graph shows the canonical
`User → Lead → Subagent × N → Lead → Final` shape.

Ordered simple → complex. The expected sub-agent count is the *typical* fan-out
for a capable lead agent; exact numbers vary by model and routing. The
requirement for a good demo is **≥ 2 parallel `task` delegations**.

> Tip: comparison / "research A and B" / multi-region / multi-document tasks are
> the most reliable triggers — they have an obvious parallel decomposition.

---

## English

### 1. Two-way comparison — *expect 2 subagents* (research)

> Compare DeerFlow and LangGraph as multi-agent frameworks, then summarise their
> key differences in a short table.

Lead delegates one research sub-agent per framework, then synthesises the table.
This is the prompt baked into the bundled demos.

### 2. Three-city itinerary — *expect 3 subagents* (research / planning)

> Plan a one-day itinerary for Tokyo, Kyoto, and Osaka. Research each city's top
> sights separately, then combine them into a single day-by-day plan.

One sub-agent per city, fanned out in parallel; lead merges into a plan.

### 3. Pros/cons debate — *expect 2 subagents* (analysis)

> Should a small startup use a monorepo or polyrepo? Have one agent argue for
> monorepo and another argue for polyrepo, then give a balanced recommendation.

Two opposing-stance sub-agents, then a lead synthesis. Good for showing the
"returns → produces" handoff.

### 4. Multi-source literature scan — *expect 3-4 subagents* (research)

> Survey the current state of retrieval-augmented generation. Research (a)
> chunking strategies, (b) vector store options, (c) reranking approaches, and
> (d) evaluation methods — one focused agent each — then write a synthesis.

Explicitly names four work items → four sub-agents. Good for showing column-2
stacking with several rows.

### 5. Code + docs + tests split — *expect 3 subagents* (engineering)

> Add a rate limiter to our API. Split the work: one agent designs the algorithm,
> one drafts the implementation plan, one writes the test plan. Then merge into a
> single proposal.

Three role-specialised sub-agents; lead consolidates.

---

## 中文

### 1. 双向对比 — *预期 2 个 subagent*（research）

> 对比 DeerFlow 和 LangGraph 这两个多智能体框架，然后用一个简短表格总结它们的关键差异。

Lead 给每个框架派一个研究 subagent，再汇总成表格。与内置 demo 同款 prompt。

### 2. 三城行程 — *预期 3 个 subagent*（research / planning）

> 为东京、京都、大阪规划一日游。分别调研每个城市的主要景点，再合并成一份逐日计划。

每座城市一个 subagent，并行展开，Lead 合并成计划。

### 3. 正反方辩论 — *预期 2 个 subagent*（analysis）

> 小型创业公司应该用 monorepo 还是 polyrepo？让一个 agent 支持 monorepo、另一个支持
> polyrepo，最后给出一个平衡的建议。

两个对立立场的 subagent，再由 Lead 综合，适合演示 “returns → produces” 的回流。

### 4. 多来源文献扫描 — *预期 3-4 个 subagent*（research）

> 调研检索增强生成（RAG）的现状。分别研究：（a）分块策略、（b）向量库选型、
> （c）重排方法、（d）评测方法 —— 每个方向一个专注的 agent —— 然后写一份综述。

显式列出四个工作项 → 四个 subagent，适合展示第 2 列多行堆叠。

### 5. 代码 / 文档 / 测试拆分 — *预期 3 个 subagent*（engineering）

> 给我们的 API 加一个限流器。拆分任务：一个 agent 设计算法、一个起草实现计划、
> 一个编写测试计划，最后合并成一份完整方案。

三个角色化的 subagent，由 Lead 整合。

---

## Notes on reliability

- **Make the parallelism explicit.** Prompts that *name* the parallel work items
  ("research each … separately", "one agent each") fan out far more reliably than
  open-ended ones.
- **Comparisons are the safest bet.** "Compare X and Y" almost always yields 2
  sub-agents.
- **Model matters.** Smaller/cheaper lead models may answer directly without
  delegating. If you see no sub-agents, switch the lead to a stronger model or use
  a more explicit "split the work" framing.
- **No backend? No prompt needed.** The zero-backend demos
  ([`demo_standalone.html`](../../examples/demo_standalone.html),
  [`demo_snapshot.py`](../../examples/demo_snapshot.py)) already encode the
  2-subagent shape.
