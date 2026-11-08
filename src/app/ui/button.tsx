import { Slot } from "radix-ui";
import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { button, type ButtonVariants } from "../../shared/ui";
import { cn } from "./cn";

export const Button = ({ className, variant, size, asChild, busy, children, disabled, ...p }: ComponentProps<"button"> & ButtonVariants & { asChild?: boolean; busy?: boolean }) => {
  const C = asChild ? Slot.Root : "button";
  return (
    <C className={cn(button({ variant, size }), className)} disabled={disabled || busy} aria-busy={busy || undefined} {...p}>
      {asChild ? children : <>{busy && <Loader2 className="animate-spin" aria-hidden />}{children}</>}
    </C>
  );
};
