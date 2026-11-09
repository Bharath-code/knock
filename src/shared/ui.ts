import { cva, type VariantProps } from "class-variance-authority";

// shadcn's buttonVariants, kept here so the server-rendered hono pages and the React inbox share one recipe.
// Changes from stock: 44px tall on touch screens, pointer cursor, press scale, aria-busy cursor, destructive-outline.
export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap no-underline transition-[background-color,border-color,color,box-shadow,transform] duration-(--d-fast) ease-out outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-button-primary font-semibold text-primary-foreground hover:text-primary-foreground",
        destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90 hover:text-white dark:bg-destructive/70",
        outline: "border border-input bg-card text-foreground shadow-xs hover:border-foreground/20 hover:bg-accent hover:text-accent-foreground active:bg-muted",
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
// No border: the elevation's 1px hairline draws the edge (BoardUI's sidebar elevation).
export const card = "rounded-xl bg-card text-card-foreground shadow-e-2";
export const raised = card;

// BoardUI-style status pills and halo dots. Tones are semantic, so every page colours "yes" the same way.
export type Tone = "yes" | "later" | "no" | "maybe" | "brand" | "neutral";
const toneText: Record<Tone, string> = {
  yes: "bg-yes-soft text-yes-ink ring-yes/25",
  later: "bg-later-soft text-later-ink ring-later/25",
  no: "bg-no-soft text-no-ink ring-destructive/25",
  maybe: "bg-maybe-soft text-brass-ink ring-maybe/30",
  brand: "bg-brass-soft text-brass-ink ring-primary/25",
  neutral: "bg-muted text-muted-foreground ring-border",
};
const toneDot: Record<Tone, string> = {
  yes: "bg-yes text-yes",
  later: "bg-later text-later",
  no: "bg-destructive text-destructive",
  maybe: "bg-maybe text-maybe",
  brand: "bg-primary text-primary",
  neutral: "bg-input text-input",
};
export const pill = (tone: Tone = "neutral") =>
  `inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${toneText[tone]}`;
// 6px dot on a soft halo of the same colour (currentColor via the text class).
export const dot = (tone: Tone = "neutral") => `size-1.5 shrink-0 rounded-full shadow-[0_0_0_3px_color-mix(in_oklab,currentColor_22%,transparent)] ${toneDot[tone]}`;
export const alert = "rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive";
export const notice = "rounded-md border bg-card px-4 py-3 text-sm";
