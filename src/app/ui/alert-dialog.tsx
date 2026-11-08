import { AlertDialog as A } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { button } from "../../shared/ui";
import { cn } from "./cn";

export const AlertDialog = A.Root;
export const AlertDialogTrigger = A.Trigger;

export const AlertDialogContent = ({ title, description, children, className, ...p }: ComponentProps<typeof A.Content> & { title: ReactNode; description: ReactNode }) => (
  <A.Portal>
    <A.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-[fade_var(--d-base)_var(--ease-out)]" />
    <A.Content
      className={cn("fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-card p-6 text-ink shadow-e-2 data-[state=open]:animate-rise", className)}
      {...p}
    >
      <A.Title className="text-lg font-semibold">{title}</A.Title>
      <A.Description className="mt-2 text-sm text-muted">{description}</A.Description>
      {children}
    </A.Content>
  </A.Portal>
);

export const AlertDialogCancel = ({ className, ...p }: ComponentProps<typeof A.Cancel>) => <A.Cancel className={cn(button({ variant: "secondary" }), className)} {...p} />;
export const AlertDialogAction = ({ className, ...p }: ComponentProps<typeof A.Action>) => <A.Action className={cn(button({ variant: "danger" }), className)} {...p} />;
