import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Minimal scrollable container fallback. deergraph ships this so the details
 * panel works without a host design system; hosts can override via `className`.
 */
export const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div ref={ref} className={cn("overflow-auto", className)} {...props}>
    {children}
  </div>
));
ScrollArea.displayName = "ScrollArea";
