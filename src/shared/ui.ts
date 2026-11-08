import { cva, type VariantProps } from "class-variance-authority";

// One source of control styles for the React inbox (shadcn components) and the server-rendered hono pages.
export const button = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap no-underline select-none transition-[background-color,border-color,color,box-shadow,transform] duration-(--d-fast) ease-out active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brass text-on-accent shadow-e-1 hover:bg-brass-hover hover:text-on-accent",
        secondary: "border border-line bg-card text-ink shadow-e-1 hover:border-line-strong hover:bg-sunk hover:text-ink",
        ghost: "text-muted hover:bg-sunk hover:text-ink",
        danger: "bg-no text-on-accent shadow-e-1 hover:opacity-90 hover:text-on-accent",
        "danger-outline": "border border-line bg-card text-no hover:border-no hover:bg-no-soft hover:text-no",
      },
      size: {
        md: "h-11 px-4 text-sm sm:h-10",
        lg: "h-12 px-5 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);
export type ButtonVariants = VariantProps<typeof button>;

export const input =
  "block w-full rounded-md border border-line bg-card px-3 py-2.5 text-base text-ink shadow-e-1 transition-[border-color,box-shadow] duration-(--d-fast) ease-out placeholder:text-muted hover:border-line-strong focus-visible:border-brass focus-visible:ring-3 focus-visible:ring-brass/20 focus-visible:outline-none aria-invalid:border-no disabled:opacity-50";

export const label = "block text-sm font-medium text-ink";
export const hint = "mt-1.5 text-sm text-muted";
export const card = "rounded-lg border border-line bg-card shadow-e-1";
export const alert = "rounded-md border border-no/40 bg-no-soft px-4 py-3 text-sm text-no";
export const notice = "rounded-md border border-line bg-card px-4 py-3 text-sm";
