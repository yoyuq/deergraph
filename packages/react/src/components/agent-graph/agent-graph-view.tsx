"use client";

import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";

import type { AgentGraphSnapshot } from "@/core/agent-graph/types";
import { cn } from "@/lib/cn";

import { AgentGraphCanvas } from "./agent-graph-canvas";
import { AgentGraphDetailsPanel } from "./agent-graph-details-panel";
import {
  AgentGraphEmpty,
  AgentGraphError,
  AgentGraphLoading,
} from "./agent-graph-states";

export interface AgentGraphViewProps {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  data: AgentGraphSnapshot | undefined;
  onRetry?: () => void;
  className?: string;
}

/**
 * Presentational orchestrator: maps a query-like state (pending / error / data)
 * onto the loading / error / empty / canvas branches and owns node-selection
 * state. Decoupled from react-query so it can be unit-tested with plain props;
 * the page wires {@link useAgentGraph} into it.
 */
export function AgentGraphView({
  isPending,
  isError,
  error,
  data,
  onRetry,
  className,
}: AgentGraphViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedNode = useMemo(() => {
    if (!data || !selectedId) return null;
    return data.nodes.find((n) => n.id === selectedId) ?? null;
  }, [data, selectedId]);

  if (isPending) {
    return (
      <div className={cn("h-full w-full", className)}>
        <AgentGraphLoading />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={cn("h-full w-full", className)}>
        <AgentGraphError error={error} onRetry={onRetry} />
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className={cn("h-full w-full", className)}>
        <AgentGraphEmpty />
      </div>
    );
  }

  return (
    <div className={cn("flex h-full w-full flex-col", className)}>
      {data.truncated ? (
        <div className="bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center gap-2 border-b px-4 py-2 text-xs">
          <AlertTriangle className="size-3.5" />
          This graph may be incomplete (truncated to a safe event limit).
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <AgentGraphCanvas
            snapshot={data}
            selectedId={selectedId}
            onSelectNode={setSelectedId}
          />
        </div>
        <div className="bg-card hidden w-80 shrink-0 border-l md:block">
          <AgentGraphDetailsPanel
            node={selectedNode}
            onClose={
              selectedNode ? () => setSelectedId(null) : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
