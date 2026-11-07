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
- Set live secrets: `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `TURNSTILE_SECRET`, `SMOKE_TOKEN`.
- Live `EMAIL_FROM` must be an address on a domain verified in Resend. Staging uses `onboarding@resend.dev`, which only delivers to the Resend account owner and `resend.dev` sinks, so real senders get no receipt or closure email until the domain is verified.
- Spend limit on the live Anthropic key and a global daily budget on the model route (see the DEM-55 comment).
- Live Turnstile widget lists the live hostname.
- `bun run deploy:live`, then smoke and Lighthouse against live.

## Conventions

- Typecheck and tests must pass before staging: `bun run typecheck`, `bun test src`.
- Staging uses its own secrets. Never copy live secrets into staging or `.dev.vars.*`.
- Staging emails only go to the user's own address.
- Fake test data: `bun run seed:local` or `bun run seed:staging` (5 doors under /d/seed_akash, 8 knocks, sender emails are `delivered+seedN@resend.dev`). Safe to rerun. The script refuses live.
