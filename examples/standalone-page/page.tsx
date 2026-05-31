"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { AgentGraphView } from "@/components/workspace/agent-graph";
import { useAgentGraph } from "@/core/agent-graph";

/**
 * Standalone full-screen DeerGraph page.
 *
 * URL: `/workspace/chats/{thread_id}/runs/{run_id}/graph`
 *
 * Stage-3 scope: read-only static graph. The only data path is
 * {@link useAgentGraph} -> `fetchAgentGraph` -> the stage-1 snapshot API. No
 * SSE/polling/realtime. react-query's client is provided by the workspace
 * layout (`WorkspaceContent`).
 */
export default function RunGraphPage() {
  const params = useParams<{ thread_id: string; run_id: string }>();
  const threadId = params.thread_id;
  const runId = params.run_id;

  const { data, isPending, isError, error, refetch } = useAgentGraph(
    threadId,
    runId,
  );

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <Link
          href={`/workspace/chats/${threadId}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          Back to chat
        </Link>
        <div className="ml-2 flex min-w-0 flex-col">
          <span className="text-sm font-medium">Agent Graph</span>
          <span className="text-muted-foreground truncate text-xs">
            run {runId}
          </span>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <AgentGraphView
          isPending={isPending}
          isError={isError}
          error={error}
          data={data}
          onRetry={() => void refetch()}
        />
      </main>
    </div>
  );
}
