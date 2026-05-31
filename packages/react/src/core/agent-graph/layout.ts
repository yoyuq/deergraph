import { type Edge, MarkerType, type Node } from "@xyflow/react";

import type {
  AgentGraphEdge,
  AgentGraphNode,
  AgentGraphNodeType,
  AgentGraphSnapshot,
} from "./types";

/** Data carried on a React Flow node — the original snapshot node. */
export interface AgentFlowNodeData extends Record<string, unknown> {
  node: AgentGraphNode;
}

/** Data carried on a React Flow edge — the original snapshot edge. */
export interface AgentFlowEdgeData extends Record<string, unknown> {
  edge: AgentGraphEdge;
}

export type AgentFlowNode = Node<AgentFlowNodeData, "agentGraphNode">;
export type AgentFlowEdge = Edge<AgentFlowEdgeData>;

export interface AgentFlowGraph {
  nodes: AgentFlowNode[];
  edges: AgentFlowEdge[];
}

/** Horizontal gap between role columns, in px. */
export const COLUMN_GAP = 300;
/** Vertical gap between stacked nodes in the same column, in px. */
export const ROW_GAP = 150;

/**
 * Left-to-right column depth per node role. User on the left, the final answer
 * (or error) on the right; subagents and plain tools share the middle column.
 */
const DEPTH: Record<AgentGraphNodeType, number> = {
  user: 0,
  lead_agent: 1,
  subagent: 2,
  tool: 2,
  final: 3,
  error: 3,
};

/**
 * Convert a backend `AgentGraphSnapshot` into React Flow nodes/edges with a
 * deterministic layered layout.
 *
 * Pure and side-effect free: same input → same output. No DOM, no React Flow
 * runtime needed, so it is unit-testable in isolation. Positions are a simple
 * columns-by-role / stack-within-column layout — good enough for the MVP static
 * graph; a force/dagre layout can replace this later without touching callers.
 */
export function snapshotToFlow(snapshot: AgentGraphSnapshot): AgentFlowGraph {
  const rowCountByDepth = new Map<number, number>();

  const nodes: AgentFlowNode[] = snapshot.nodes.map((node) => {
    const depth = DEPTH[node.type] ?? 0;
    const row = rowCountByDepth.get(depth) ?? 0;
    rowCountByDepth.set(depth, row + 1);

    return {
      id: node.id,
      type: "agentGraphNode",
      position: { x: depth * COLUMN_GAP, y: row * ROW_GAP },
      data: { node },
    } satisfies AgentFlowNode;
  });

  const edges: AgentFlowEdge[] = snapshot.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "smoothstep",
    label: edge.label,
    animated: edge.status === "active",
    markerEnd: { type: MarkerType.ArrowClosed },
    data: { edge },
  }));

  return { nodes, edges };
}
