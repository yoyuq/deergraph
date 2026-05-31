"use client";

import { Workflow, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAgentGraph } from "@/core/agent-graph/hooks";
import { cn } from "@/lib/cn";

import { AgentGraphView } from "./agent-graph-view";

export interface ChatAgentGraphPanelProps {
  /**
   * Resolved run id to display. `null` shows an empty-state hint instead of a
   * fabricated graph. deergraph does not resolve thread→run — the host passes a
   * run id in (ADR-004 contract 5).
   */
  runId: string | null;
  /** Whether the panel is visible. Gates the query so a closed panel is inert. */
  open: boolean;
  onClose: () => void;
  className?: string;
}

/**
 * Container that reuses {@link AgentGraphView} to show one run's agent graph.
 * Low-invasive: owns no business state, never fabricates a run id, and isolates
 * graph errors (the view renders its own error branch).
 */
export function ChatAgentGraphPanel({
  runId,
  open,
  onClose,
  className,
}: ChatAgentGraphPanelProps) {
  const hasRun = runId != null;
  const query = useAgentGraph(runId ?? undefined, {
    enabled: open && hasRun,
  });

  return (
    <div
      className={cn(
        "bg-background flex h-full w-full flex-col overflow-hidden",
        className,
      )}
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Workflow className="size-4" />
          Agent Graph
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close agent graph"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </header>
      <div className="min-h-0 flex-1">
        {hasRun ? (
          <AgentGraphView
            isPending={query.isPending}
            isError={query.isError}
            error={query.error}
            data={query.data}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
            <Workflow className="text-muted-foreground size-7" />
            <p className="text-sm font-medium">No run selected yet</p>
            <p className="text-muted-foreground max-w-sm text-xs">
              Run or select a conversation turn to view its Agent Graph.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
