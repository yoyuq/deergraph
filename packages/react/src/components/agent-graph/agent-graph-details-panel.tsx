import { X } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import type { AgentGraphNode } from "@/core/agent-graph/types";
import {
  formatDuration,
  nodeRoleLabel,
  statusLabel,
} from "@/core/agent-graph/visuals";
import { cn } from "@/lib/utils";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </div>
      <div className="text-sm break-words whitespace-pre-wrap">{value}</div>
    </div>
  );
}

/**
 * Side panel showing the details of the selected graph node. Pure presentational
 * component — the parent owns selection state. When `node` is null it renders a
 * hint instead.
 */
export function AgentGraphDetailsPanel({
  node,
  onClose,
  className,
}: {
  node: AgentGraphNode | null;
  onClose?: () => void;
  className?: string;
}) {
  if (!node) {
    return (
      <aside
        className={cn(
          "text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm",
          className,
        )}
      >
        Select a node to see its details.
      </aside>
    );
  }

  const duration = formatDuration(node.durationMs);

  return (
    <aside className={cn("flex h-full flex-col", className)}>
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <div className="text-sm font-semibold">{nodeRoleLabel(node.type)}</div>
          <div className="text-muted-foreground text-xs">
            {statusLabel(node.status)}
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="text-muted-foreground hover:text-foreground rounded p-1"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </header>
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          <Field label="Node ID" value={node.id} />
          {node.correlationId ? (
            <Field label="Correlation ID" value={node.correlationId} />
          ) : null}
          {duration ? <Field label="Duration" value={duration} /> : null}
          {node.startedAt ? (
            <Field label="Started" value={node.startedAt} />
          ) : null}
          {node.endedAt ? <Field label="Ended" value={node.endedAt} /> : null}
          {node.summary ? <Field label="Summary" value={node.summary} /> : null}
          {node.inputPreview ? (
            <Field label="Input" value={node.inputPreview} />
          ) : null}
          {node.outputPreview ? (
            <Field label="Output" value={node.outputPreview} />
          ) : null}
          {node.error ? (
            <div className="space-y-0.5">
              <div className="text-destructive text-[11px] font-medium tracking-wide uppercase">
                Error
              </div>
              <div className="text-destructive text-sm break-words whitespace-pre-wrap">
                {node.error}
              </div>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </aside>
  );
}
