import { Handle, type NodeProps, Position } from "@xyflow/react";

import type { AgentFlowNode } from "@/core/agent-graph/layout";
import type { AgentGraphNode } from "@/core/agent-graph/types";
import {
  nodeRoleLabel,
  statusLabel,
  statusTone,
  type StatusTone,
} from "@/core/agent-graph/visuals";
import { cn } from "@/lib/cn";

const TONE_BADGE: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  running: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  danger: "bg-destructive/15 text-destructive",
};

const TONE_ACCENT: Record<StatusTone, string> = {
  neutral: "border-border",
  running: "border-blue-500/40",
  success: "border-emerald-500/40",
  warning: "border-amber-500/40",
  danger: "border-destructive/50",
};

/**
 * Pure presentational card for one graph node. No React Flow context — rendered
 * both inside the canvas (wrapped by {@link AgentGraphNode}) and testable in
 * isolation.
 */
export function AgentGraphNodeCard({
  node,
  selected = false,
}: {
  node: AgentGraphNode;
  selected?: boolean;
}) {
  const tone = statusTone(node.status);
  const preview = node.summary ?? node.outputPreview ?? node.inputPreview;

  return (
    <div
      className={cn(
        "bg-card text-card-foreground w-56 rounded-lg border-2 px-3 py-2 shadow-sm transition-colors",
        TONE_ACCENT[tone],
        selected && "ring-primary ring-2 ring-offset-1",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{nodeRoleLabel(node.type)}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium",
            TONE_BADGE[tone],
          )}
        >
          {statusLabel(node.status)}
        </span>
      </div>
      {preview ? (
        <p className="text-muted-foreground mt-1 line-clamp-2 text-xs break-words">
          {preview}
        </p>
      ) : null}
    </div>
  );
}

/** React Flow custom node: a {@link AgentGraphNodeCard} flanked by handles. */
export function AgentGraphNode({ data, selected }: NodeProps<AgentFlowNode>) {
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-muted-foreground !h-2 !w-2"
      />
      <AgentGraphNodeCard node={data.node} selected={selected} />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-muted-foreground !h-2 !w-2"
      />
    </>
  );
}
