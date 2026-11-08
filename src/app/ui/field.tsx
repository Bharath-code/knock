import type { ComponentProps } from "react";
import { input } from "../../shared/ui";
import { cn } from "./cn";

export const Input = ({ className, ...p }: ComponentProps<"input">) => <input className={cn(input, className)} {...p} />;
export const Textarea = ({ className, ...p }: ComponentProps<"textarea">) => <textarea className={cn(input, "resize-y", className)} {...p} />;
export const Select = ({ className, ...p }: ComponentProps<"select">) => <select className={cn(input, "appearance-auto", className)} {...p} />;
