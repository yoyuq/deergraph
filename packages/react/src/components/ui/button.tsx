import * as React from "react";

import { cn } from "../../lib/cn";

export type ButtonVariant =
  | "default"
  | "ghost"
  | "outline"
  | "secondary"
  | "destructive"
  | "link";
export type ButtonSize = "default" | "sm" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * Minimal unstyled fallback button. deergraph ships this so the components work
 * out of the box; a host can override styling via `className` or replace the UI
 * layer entirely. `variant`/`size` are accepted for API compatibility but only
 * surface as data attributes (no opinionated styling).
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      data-variant={variant}
      data-size={size}
      className={cn(className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
