# Doorbell

Cloudflare Worker (Hono, React) with D1, Durable Objects, R2, Queues. Tasks come from the Linear project "Doorbell".

## Release rule (read first)

**Do not touch live until the user says go live, after all tasks are finished.** That means no `deploy:live`, no `wrangler deploy` without `CLOUDFLARE_ENV=staging`, no remote migrations on the live database, no live secrets, no live smoke runs. Work only in local and staging. If a step would affect live, stop and ask.

| Env | Worker | Database | Run |
|---|---|---|---|
| local | `bun run dev` | `bun run db:local` | http://localhost:5173 |
| staging | `doorbell-staging` | `doorbell-staging` | `bun run deploy:staging`, then `bun run smoke:staging` |
| live | `doorbell` | `doorbell` | `bun run deploy:live`, only on the user's go-live |

Per task: build and test locally, then deploy to staging, run the staging smoke script and a manual check, fix errors there, and only then commit, PR and merge. Merging is not going live.

## Go-live checklist (do together, once, on the user's word)

- Apply pending migrations to live with `bun run db:live`, before deploying code.
- Set live secrets: `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `TURNSTILE_SECRET`, `SMOKE_TOKEN`, `CODES_KEY` (`openssl rand -base64 32`; encrypts invite codes, and rotating it strands every unassigned code).
- Set `ADMIN_EMAILS` (comma-separated) on live so the owner can open `/admin/metrics`. Everyone else gets a 404. The page reads event counts through the `ANALYTICS_SQL` binding (Analytics SQL API, beta), which needs no token.
- Live `EMAIL_FROM` must be an address on a domain verified in Resend. Staging uses `onboarding@resend.dev`, which only delivers to the Resend account owner and `resend.dev` sinks, so real senders get no receipt or closure email until the domain is verified.
- Spend limit on the live Anthropic key and a global daily budget on the model route (see the DEM-55 comment). Ranking also spends: one Haiku call per knock (`rank_model` log event, about $0.0001 each). Set `RANKER` to `rules` or `off` to stop it; with no `RANKER`, a key means Haiku.
- After changing the rank prompt, run `bun --env-file=.dev.vars scripts/check-rank.ts`. Every injected fixture must keep its band.
- Live Turnstile widget lists the live hostname.
- `PUBLIC_ORIGIN` in `wrangler.jsonc` is the live URL. The cron uses it to build the daily digest's inbox and unsubscribe links, because cron runs have no request URL. Update it if the live domain changes. Staging has no cron, so the digest only runs on live.
- The changelog (`src/shared/changelog.ts`) is dated by merge, so before launch re-date the entries or fold them into one launch entry. Replace the first-draft FAQ (`src/shared/faq.ts`) with the questions in the feedback log.
- `bun run deploy:live`, then smoke and Lighthouse against live.

## UI

- Two renderers: `/app` is React (`src/app/main.tsx`). Every other page is server-rendered `hono/jsx` through `Shell` in `src/worker/door-pages.tsx`, with no React runtime. Public pages must work without JS. Home ships zero `<script>`, and smoke checks this. Pass `copy` to `Shell` only on pages with a Copy button.
- shadcn is set up (`components.json`, `@/` → `src/`). Add components with `bunx shadcn@latest add <name>`. They land in `src/app/ui/` and import `cn` from shadcn's `cn` package. Use them in `/app` only.
- `src/shared/ui.ts` holds the shared recipes: `buttonVariants` (shadcn variant names, plus `destructive-outline`), `input`, `label`, `card`, `alert`, `notice`. shadcn's `Button` imports from it, and hono pages call `button({ variant, size })`. Never hand-copy button or input classes.
- Colours are shadcn tokens in `src/styles/theme.css`, in oklch: warm neutral greys with brass as `primary`, and no blue. Light and dark come from `prefers-color-scheme` or `data-theme`; the `dark:` variant follows both. Old names (`paper`, `ink`, `brass`, `line`, `sunk`, `no`) are aliases. For grey text use `text-muted-foreground`, because `muted` is a background.
- Type scale is `text-xs`…`text-3xl` only, with no pixel sizes. Headings are the display serif (Newsreader) at weight 500; body and UI are Schibsted Grotesk. No monospace face: `font-mono` maps to the sans with tabular digits. Buttons are 44px tall on touch screens (`h-11 sm:h-9`).
- Every control needs hover, focus-visible, disabled and loading states. Keyboard shortcuts in `/app` must ignore inputs and `[role=dialog], [role=alertdialog]`.
- After UI edits, run `~/.claude/skills/impeccable/scripts/impeccable detect --json <files>`. Check light and dark at 375px and 1280px, with no horizontal scroll.

## Conventions

- Typecheck and tests must pass before staging: `bun run typecheck`, `bun test src`.
- Staging uses its own secrets. Never copy live secrets into staging or `.dev.vars.*`.
- Staging emails only go to the user's own address.
- Fake test data: `bun run seed:local` or `bun run seed:staging` (5 doors under /d/seed_akash, 8 knocks, sender emails are `delivered+seedN@resend.dev`). Safe to rerun. The script refuses live.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
