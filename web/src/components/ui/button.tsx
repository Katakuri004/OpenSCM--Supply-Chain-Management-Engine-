import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { LoaderCircle } from "lucide-react";

const variants = cva(
  "workspace-button inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent)] text-white hover:opacity-90",
        outline: "border border-[var(--border)] bg-[var(--panel)] hover:bg-[var(--muted)]",
        ghost: "hover:bg-[var(--muted)]",
      },
      size: { default: "h-9 px-3", icon: "size-9" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> &
    VariantProps<typeof variants> & { asChild?: boolean; loading?: boolean }
>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      children,
      disabled,
      title,
      ...props
    },
    ref,
  ) => {
    const Component = asChild ? Slot : "button";
    return (
      <Component
        ref={ref}
        className={cn(variants({ variant, size, className }))}
        disabled={disabled || loading}
        title={title ?? (size === "icon" ? props["aria-label"] : undefined)}
        aria-busy={loading}
        data-variant={variant ?? "default"}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <LoaderCircle className="motion-spinner" aria-hidden="true" />}
            {children}
          </>
        )}
      </Component>
    );
  },
);
Button.displayName = "Button";
