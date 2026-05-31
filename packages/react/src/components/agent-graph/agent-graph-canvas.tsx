"use client";

import {
  Background,
  Controls,
  type NodeMouseHandler,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";

import {
  type AgentFlowNode,
  snapshotToFlow,
} from "@/core/agent-graph/layout";
import type { AgentGraphSnapshot } from "@/core/agent-graph/types";
import { cn } from "@/lib/cn";

import { AgentGraphNode } from "./agent-graph-node";

// Module-level so the object identity is stable across renders (React Flow
// warns otherwise).
const NODE_TYPES = { agentGraphNode: AgentGraphNode };

/**
 * Static React Flow canvas for one run's graph snapshot. Stage-3 scope: no
 * realtime — the snapshot is rendered once and only re-laid-out when the
 * snapshot prop changes. Node clicks bubble up via `onSelectNode`.
 */
export function AgentGraphCanvas({
  snapshot,
  selectedId,
  onSelectNode,
  className,
}: {
  snapshot: AgentGraphSnapshot;
  selectedId?: string | null;
  onSelectNode?: (nodeId: string) => void;
  className?: string;
}) {
  const { nodes, edges } = useMemo(() => snapshotToFlow(snapshot), [snapshot]);

  const flowNodes = useMemo<AgentFlowNode[]>(
    () =>
      nodes.map((n) => ({ ...n, selected: n.id === selectedId })),
    [nodes, selectedId],
  );

  const handleNodeClick = useMemo<NodeMouseHandler<AgentFlowNode>>(
    () => (_event, node) => onSelectNode?.(node.id),
    [onSelectNode],
  );

  return (
    <div className={cn("h-full w-full", className)}>
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={handleNodeClick}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
