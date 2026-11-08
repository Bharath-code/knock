import { cva, type VariantProps } from "class-variance-authority";

// shadcn's buttonVariants, kept here so the server-rendered hono pages and the React inbox share one recipe.
// Changes from stock: 44px tall on touch screens, pointer cursor, press scale, aria-busy cursor, destructive-outline.
export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap no-underline transition-[background-color,border-color,color,box-shadow,transform] duration-(--d-fast) ease-out outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 hover:text-primary-foreground",
        destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90 hover:text-white dark:bg-destructive/70",
        outline: "border border-input bg-card text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:text-secondary-foreground",
        ghost: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        "destructive-outline": "border border-input bg-card text-destructive shadow-xs hover:border-destructive hover:bg-destructive/10 hover:text-destructive",
      },
      size: {
        default: "h-11 px-4 has-[>svg]:px-3 sm:h-9",
        sm: "h-9 gap-1.5 px-3 has-[>svg]:px-2.5 sm:h-8",
        lg: "h-12 px-6 text-base has-[>svg]:px-4 sm:h-11",
        icon: "size-11 sm:size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
export type ButtonVariants = VariantProps<typeof buttonVariants>;
export const button = buttonVariants;

export const input =
  "block w-full min-w-0 rounded-md border border-input bg-card px-3 py-2.5 text-base text-foreground shadow-xs transition-[color,border-color,box-shadow] duration-(--d-fast) outline-none placeholder:text-muted-foreground hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm dark:bg-input/30";

export const label = "block text-sm font-medium text-foreground";
export const hint = "mt-1.5 text-sm text-muted-foreground";
export const card = "rounded-xl border bg-card text-card-foreground shadow-xs";
export const alert = "rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive";
export const notice = "rounded-md border bg-card px-4 py-3 text-sm";
