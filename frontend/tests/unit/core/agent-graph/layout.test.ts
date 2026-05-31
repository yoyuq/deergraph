/**
 * Tests for the pure snapshot -> React Flow adapter.
 *
 * `snapshotToFlow` is the deterministic layout core that the canvas renders.
 * Keeping it pure (no DOM, no React Flow runtime) lets us pin the column
 * placement, node/edge identity preservation, and empty-state behaviour
 * without mounting anything.
 */
import { describe, expect, test } from "vitest";

import { snapshotToFlow } from "@/core/agent-graph/layout";
import type {
  AgentGraphNode,
  AgentGraphSnapshot,
} from "@/core/agent-graph/types";

function node(partial: Partial<AgentGraphNode> & Pick<AgentGraphNode, "id" | "type">): AgentGraphNode {
  return {
    label: partial.type,
    status: "completed",
    threadId: "t1",
    runId: "r1",
    ...partial,
  } as AgentGraphNode;
}

function snapshot(
  nodes: AgentGraphNode[],
  edges: AgentGraphSnapshot["edges"] = [],
): AgentGraphSnapshot {
  return {
    threadId: "t1",
    runId: "r1",
    version: 1,
    truncated: false,
    updatedAt: "2026-05-31T00:00:00+00:00",
    nodes,
    edges,
  };
}

describe("snapshotToFlow", () => {
  test("empty snapshot yields no flow nodes or edges", () => {
    const flow = snapshotToFlow(snapshot([]));
    expect(flow.nodes).toEqual([]);
    expect(flow.edges).toEqual([]);
  });

  test("each node becomes a custom flow node preserving id and original data", () => {
    const user = node({ id: "user", type: "user" });
    const flow = snapshotToFlow(snapshot([user]));

    expect(flow.nodes).toHaveLength(1);
    const fn = flow.nodes[0]!;
    expect(fn.id).toBe("user");
    expect(fn.type).toBe("agentGraphNode");
    expect(fn.data.node).toEqual(user);
    expect(typeof fn.position.x).toBe("number");
    expect(typeof fn.position.y).toBe("number");
  });

  test("places nodes in left-to-right columns by role depth", () => {
    const flow = snapshotToFlow(
      snapshot([
        node({ id: "user", type: "user" }),
        node({ id: "lead_agent", type: "lead_agent" }),
        node({ id: "subagent:call_1", type: "subagent" }),
        node({ id: "final", type: "final" }),
      ]),
    );
    const x = (id: string) => flow.nodes.find((n) => n.id === id)!.position.x;
    expect(x("user")).toBeLessThan(x("lead_agent"));
    expect(x("lead_agent")).toBeLessThan(x("subagent:call_1"));
    expect(x("subagent:call_1")).toBeLessThan(x("final"));
  });

  test("error node shares the final column depth", () => {
    const flow = snapshotToFlow(
      snapshot([
        node({ id: "lead_agent", type: "lead_agent" }),
        node({ id: "final", type: "error" }),
      ]),
    );
    const x = (id: string) => flow.nodes.find((n) => n.id === id)!.position.x;
    expect(x("final")).toBeGreaterThan(x("lead_agent"));
  });

  test("stacks multiple nodes in the same column at distinct y positions", () => {
    const flow = snapshotToFlow(
      snapshot([
        node({ id: "subagent:a", type: "subagent" }),
        node({ id: "subagent:b", type: "subagent" }),
        node({ id: "subagent:c", type: "subagent" }),
      ]),
    );
    const ys = flow.nodes.map((n) => n.position.y);
    expect(new Set(ys).size).toBe(3);
  });

  test("maps edges preserving id/source/target and carrying original edge data", () => {
    const flow = snapshotToFlow(
      snapshot(
        [
          node({ id: "user", type: "user" }),
          node({ id: "lead_agent", type: "lead_agent" }),
        ],
        [
          {
            id: "edge:user->lead",
            source: "user",
            target: "lead_agent",
            type: "input",
          },
        ],
      ),
    );
    expect(flow.edges).toHaveLength(1);
    const fe = flow.edges[0]!;
    expect(fe.id).toBe("edge:user->lead");
    expect(fe.source).toBe("user");
    expect(fe.target).toBe("lead_agent");
    expect(fe.data?.edge.type).toBe("input");
  });
});
