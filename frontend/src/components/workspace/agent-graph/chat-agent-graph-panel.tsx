"use client";

import { Workflow, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAgentGraph } from "@/core/agent-graph/hooks";
import { cn } from "@/lib/utils";

import { AgentGraphView } from "./agent-graph-view";

/** Polling cadence while a run is in progress (Stage 4C near-realtime). */
export const CHAT_GRAPH_POLL_INTERVAL_MS = 2500;

export interface ChatAgentGraphPanelProps {
  /** Current chat thread. Always available on the chat page. */
  threadId: string;
  /**
   * Resolved run id (live active run, or latest from the run list). `undefined`
   * when the thread has no run yet — we show a hint instead of a fake graph.
   */
  runId: string | undefined;
  /** Whether the panel is visible. Gates the query so a closed panel is inert. */
  open: boolean;
  /**
   * Whether the run is currently streaming. Enables snapshot polling; cleared
   * once the run finishes so we settle on the terminal graph.
   */
  isRunning: boolean;
  onClose: () => void;
  className?: string;
}

/**
 * Chat-page container that reuses the Stage-3 {@link AgentGraphView} to show the
 * current thread/run's agent graph. Low-invasive: owns no chat state, never
 * fabricates a run id, and isolates graph errors from the chat stream (the view
 * renders its own error branch). Near-realtime is opt-in polling — no SSE, no
 * WebSocket (Stage 4C scope).
 */
export function ChatAgentGraphPanel({
  threadId,
  runId,
  open,
  isRunning,
  onClose,
  className,
}: ChatAgentGraphPanelProps) {
  const hasRun = Boolean(runId);
  const query = useAgentGraph(threadId, runId, {
    enabled: open && hasRun,
    refetchIntervalMs:
      open && isRunning && hasRun ? CHAT_GRAPH_POLL_INTERVAL_MS : false,
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
