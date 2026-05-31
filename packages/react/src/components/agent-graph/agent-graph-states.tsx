import { AlertTriangle, Loader2, Workflow } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Centered({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Shown while the snapshot request is in flight. */
export function AgentGraphLoading() {
  return (
    <Centered>
      <Loader2 className="text-muted-foreground size-6 animate-spin" />
      <p className="text-muted-foreground text-sm">Loading agent graph…</p>
    </Centered>
  );
}

/** Shown when the run produced no graph nodes (e.g. brand-new / empty run). */
export function AgentGraphEmpty() {
  return (
    <Centered>
      <Workflow className="text-muted-foreground size-7" />
      <p className="text-sm font-medium">No graph to show yet</p>
      <p className="text-muted-foreground max-w-sm text-xs">
        This run hasn&apos;t produced any agent activity, or its events are no
        longer available.
      </p>
    </Centered>
  );
}

/** Shown when the snapshot request fails. Offers a retry. */
export function AgentGraphError({
  error,
  onRetry,
}: {
  error: Error | null;
  onRetry?: () => void;
}) {
  return (
    <Centered>
      <AlertTriangle className="text-destructive size-7" />
      <p className="text-sm font-medium">Failed to load the agent graph</p>
      {error?.message ? (
        <p className="text-muted-foreground max-w-sm text-xs break-words">
          {error.message}
        </p>
      ) : null}
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </Centered>
  );
}
