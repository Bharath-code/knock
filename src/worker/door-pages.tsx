/** @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import css from "../styles/theme.css?url";
import { alert, button as btn, card, hint, input, label, notice } from "../shared/ui";
import { RETAIN_DAYS } from "./retention";
import { ownDoorPath, REF_LINE, STARTER, type Ref } from "../shared/growth";
import { answerRate, defaultFields, replyLine, templates, WINDOWS, type Template } from "../shared/door";
import type { DoorView, Owner } from "./doors";
import { KnockFormView, StatusBody, type KnockForm } from "./knock-pages";
import type { Status } from "./knocks";

const copyScript = `document.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){var t=document.getElementById(b.dataset.copy);navigator.clipboard.writeText(t.value).then(function(){b.textContent='Copied'});t.select()})})`;

// lucide door-closed, ISC
const Mark = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-brass" aria-hidden="true">
    <path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14" /><path d="M2 20h20" /><path d="M14 12v.01" />
  </svg>
);

const swapScript = `document.querySelectorAll('[data-use]').forEach(function(b){var t=document.getElementById(b.dataset.use),r=document.getElementById(b.dataset.from),old=null;b.hidden=false;b.addEventListener('click',function(){if(old===null){old=t.value;t.value=r.value;b.textContent='Undo';t.focus()}else{t.value=old;old=null;b.textContent='Use this version'}})})`;
export const Shell = ({ title, description, head, wide, copy, swap, poweredBy, children }: { title: string; description: string; head?: Child; wide?: boolean; copy?: boolean; swap?: boolean; poweredBy?: { from: Ref; t?: string }; children: Child }) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="stylesheet" href={css} />
      {head}
    </head>
    <body class="flex min-h-dvh flex-col bg-paper text-ink">
      <header class="border-b border-line">
        <div class="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:px-6">
          <a href="/" class="mr-auto inline-flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-ink no-underline hover:text-ink">
            <Mark />Doorbell
          </a>
          <a href="/check" class={`${btn({ variant: "ghost" })} max-sm:hidden`}>DM checker</a>
          <a href="/new" class={btn({ variant: "ghost" })}>Make a door</a>
          <a href="/app" class={btn({ variant: "outline" })}>Inbox</a>
        </div>
      </header>
      <main class={`mx-auto w-full px-4 py-10 sm:px-6 sm:py-14 ${wide ? "max-w-5xl" : "max-w-2xl"}`}>{children}</main>
      {poweredBy && (
        <aside class="mt-auto border-t bg-muted/50">
          <div class="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-6 sm:px-6">
            <p class="text-sm">
              <span class="font-medium">Powered by Doorbell.</span> <span class="text-muted-foreground">Get every request answered on your own posts.</span>
            </p>
            <a href={ownDoorPath(poweredBy.from, poweredBy.t)} class={btn({ variant: "outline" })}>Make your own door</a>
          </div>
        </aside>
      )}
      <footer class={`${poweredBy ? "" : "mt-auto "}border-t border-line`}>
        <p class="mx-auto flex max-w-5xl flex-wrap justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <span>Doorbell. Every knock gets an answer.</span>
          <a href="/privacy" class="text-muted-foreground hover:text-foreground">Privacy</a>
        </p>
      </footer>
      {copy && <script dangerouslySetInnerHTML={{ __html: copyScript }} />}
      {swap && <script dangerouslySetInnerHTML={{ __html: swapScript }} />}
    </body>
  </html>
);

const button = btn({ variant: "default", size: "lg" });
const field = `${input} mt-1.5`;

export type NewState = {
  ref?: Ref | null;
  starter?: Template | null;
  owner: Owner | null;
  siteKey?: string;
  post?: string;
  handle?: string;
  name?: string;
  template?: Template;
  fields?: string[];
  window?: number;
  error?: string;
};

export const NewDoorPage = ({ owner, siteKey, post, handle = "", name = "", template, fields, window = 7, error, ref, starter }: NewState) => {
  post ??= starter ? STARTER[starter] : "";
  const step2 = template !== undefined;
  const widget = siteKey && <div class="cf-turnstile" data-sitekey={siteKey} data-action="new" />;
  const rows = [...(fields ?? defaultFields[template ?? "referral"]), "", "", ""].slice(0, 3);
  return (
    <Shell
      title="Make a door | Doorbell"
      description="Paste your post. Get a door link that guarantees every sender an answer."
      head={siteKey && <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />}
    >
      <p class="text-sm text-muted-foreground tabular">Step {step2 ? 2 : 1} of 2</p>
      <h1 class="mt-2 text-3xl">{step2 ? "Check your door" : "Make a door"}</h1>
      <p class="mt-3 text-lg text-muted-foreground">
        {step2 ? "Edit what senders are asked, then create it." : "Paste the post you are about to share. Free, no sign-up."}
      </p>
      {ref && !step2 && <p class={`mt-6 ${notice}`}>{REF_LINE[ref]}{starter ? " We started your post below. Replace the parts in [brackets]." : ""}</p>}
      {error && <p role="alert" class={`mt-6 ${alert}`}>{error}</p>}
      <form method="post" action="/new" class={`mt-8 space-y-6 p-5 sm:p-8 ${card}`}>
        {ref && <input type="hidden" name="ref" value={ref} />}
        {!owner?.handle && (
          <div class="grid gap-6 sm:grid-cols-2">
            <div>
              <label for="handle" class={label}>Your handle</label>
              <input id="handle" name="handle" value={handle} required minlength={3} maxlength={21} pattern="@?[A-Za-z0-9_]{3,20}" class={field} />
            </div>
            <div>
              <label for="name" class={label}>Your name <span class="font-normal text-muted-foreground">(optional)</span></label>
              <input id="name" name="name" value={name} maxlength={60} class={field} />
            </div>
          </div>
        )}
        {owner && <p class="text-sm text-muted-foreground">Signed in on this device as <strong class="font-medium text-ink">@{owner.handle}</strong>.</p>}
        <div>
          <label for="post" class={label}>Your post</label>
          <textarea id="post" name="post" rows={step2 ? 4 : 7} maxlength={10000} class={field}>{post}</textarea>
          {!step2 && <p class={hint}>Leave it empty to claim only your profile door at /d/{owner?.handle ?? "your-handle"}.</p>}
        </div>
        {step2 ? (
          <>
            <input type="hidden" name="step" value="create" />
            <div class="grid gap-6 sm:grid-cols-2">
              <div>
                <label for="template" class={label}>Type</label>
                <select id="template" name="template" class={field}>
                  {templates.map((t) => <option value={t} selected={t === template}>{t[0]!.toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label for="window" class={label}>You will answer within</label>
                <select id="window" name="window" class={field}>
                  {WINDOWS.map((w) => <option value={w} selected={w === window}>{w} days</option>)}
                </select>
              </div>
            </div>
            <fieldset>
              <legend class={label}>What senders are asked</legend>
              <p class="mt-0.5 text-sm text-muted-foreground">Up to 3. Clear one to drop it.</p>
              <div class="mt-3 space-y-2">
                {rows.map((f, i) => <input name="field" value={f} maxlength={60} aria-label={`Question ${i + 1}`} class={input} />)}
              </div>
            </fieldset>
            {widget}
            <button type="submit" class={`${button} w-full sm:w-auto`}>Create door</button>
          </>
        ) : (
          <>
            {widget}
            <button type="submit" class={`${button} w-full sm:w-auto`}>Continue</button>
          </>
        )}
      </form>
    </Shell>
  );
};

export const doorTitle = (d: DoorView) => (d.kind === "profile" ? `Ask @${d.handle}` : d.post.split(/\n/)[0]!.slice(0, 70));

export const DoorPage = ({ door, url, made, siteKey, source = "bio", form }: { door: DoorView; url: string; made: boolean; siteKey?: string; source?: string; form?: KnockForm }) => {
  const rate = answerRate(door.knocks, door.answered);
  const og = `${url}/og.png`;
  const title = `${doorTitle(door)} | Doorbell`;
  const who = door.name || `@${door.handle}`;
  return (
    <Shell
      title={title}
      copy={made}
      poweredBy={made ? undefined : { from: "door", t: door.template }}
      description={`${who} promises an answer within ${door.windowDays} days.`}
      head={
        <>
          <meta property="og:title" content={title} />
          <meta property="og:type" content="website" />
          <meta property="og:url" content={url} />
          <meta property="og:image" content={og} />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
          <meta name="twitter:card" content="summary_large_image" />
        </>
      }
    >
      {made && (
        <section class="mb-10 rounded-lg border border-brass/30 bg-brass-soft p-5 sm:p-6" aria-labelledby="live">
          <h2 id="live" class="text-xl">Your door is live</h2>
          <label for="reply" class={`mt-3 ${label}`}>Paste this in your post or bio</label>
          <div class="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <input id="reply" readonly value={door.kind === "profile" ? `${url}?s=bio` : replyLine(`${url}?s=reply`)} class={`${input} font-mono text-sm`} />
            <button type="button" data-copy="reply" class={btn({ variant: "default" })}>Copy</button>
          </div>
        </section>
      )}
      <div class="flex items-center gap-3">
        <span aria-hidden="true" class="grid size-11 shrink-0 place-content-center rounded-full bg-brass-soft font-display text-lg font-semibold text-brass-ink">
          {(door.name || door.handle)[0]!.toUpperCase()}
        </span>
        <p class="leading-tight">
          <span class="block font-medium">{who}</span>
          <span class="text-sm text-muted-foreground">@{door.handle}</span>
        </p>
      </div>
      <h1 class="mt-6 text-3xl">{door.kind === "profile" ? "Ask me anything. You will get an answer." : "What I am looking for"}</h1>
      {door.kind !== "profile" && <p class="mt-4 text-lg whitespace-pre-line">{door.post}</p>}
      {door.status !== "open" ? (
        <p class={`mt-8 ${alert}`}>This door is closed.</p>
      ) : (
        <div class="mt-8 flex items-start gap-3 rounded-lg border border-yes/30 bg-yes-soft px-5 py-4">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mt-0.5 shrink-0 text-yes" aria-hidden="true">
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" />
          </svg>
          <p>
            <span class="block font-medium">Every knock is answered within {door.windowDays} days.</span>
            <span class="mt-0.5 block text-sm text-muted-foreground">
              {rate !== null ? <span class="tabular">{rate}% answered in time across {door.knocks} knocks.</span> : "Yes, not now, or no. Never silence."}
            </span>
          </p>
        </div>
      )}
      {door.status === "open" && <KnockFormView door={door} siteKey={siteKey} source={source} form={form} />}
    </Shell>
  );
};

export const NotFoundDoor = () => (
  <Shell title="No such door | Doorbell" description="This door does not exist.">
    <h1 class="text-3xl">No such door</h1>
    <p class="mt-3 text-lg text-muted-foreground">Check the link, or make your own.</p>
    <a href="/new" class={`mt-6 ${button}`}>Make a door</a>
  </Shell>
);

export const StatusPage = ({ s, link, token }: { s: Status; link: string; token: string }) => (
  <Shell title="Your knock | Doorbell" description="Status of your knock." head={<meta name="robots" content="noindex, nofollow" />} poweredBy={{ from: "status" }}>
    <StatusBody s={s} link={link} />
    <details class="group mt-10 border-t pt-6">
      <summary class="cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground">Delete my knock</summary>
      <div class={`mt-4 p-5 ${card}`}>
        <p class="text-sm">This permanently deletes your message, your answers and your email from this knock. {s.answer ? "" : `${s.who} will no longer see it. `}It can't be undone.</p>
        <form method="post" action={`/k/${token}/delete`} class="mt-4">
          <button class={btn({ variant: "destructive" })}>Delete permanently</button>
        </form>
      </div>
    </details>
    <p class="mt-4 text-sm text-muted-foreground">Otherwise it is deleted automatically {RETAIN_DAYS} days after it closes. <a href="/privacy">Privacy</a></p>
  </Shell>
);

export const DeletedPage = () => (
  <Shell title="Knock deleted | Doorbell" description="Your knock was deleted." head={<meta name="robots" content="noindex, nofollow" />}>
    <h1 class="text-3xl">Your knock is deleted</h1>
    <p class="mt-3 text-lg text-muted-foreground">Your message, answers and email are gone from Doorbell. The status link no longer works.</p>
  </Shell>
);

const PROCESSORS = [
  ["Cloudflare", "Runs the site and stores its data (Workers, D1, Durable Objects, Queues, R2), and checks that visitors are human (Turnstile)."],
  ["Anthropic", "Scores how well a knock fits the post and suggests a tighter version of a draft, through the Claude API."],
  ["Resend", "Sends Doorbell's emails: receipts, answers, sign-in links and the daily digest."],
] as const;

export const PrivacyPage = () => (
  <Shell title="Privacy | Doorbell" description="What Doorbell stores, for how long, and who processes it.">
    <h1 class="text-3xl">Privacy</h1>
    <p class="mt-3 text-lg text-muted-foreground">What Doorbell stores, how long it keeps it, and who processes it.</p>

    <section class="mt-10 space-y-3">
      <h2 class="text-xl">What we store</h2>
      <ul class="list-disc space-y-2 pl-5 text-muted-foreground">
        <li><span class="text-foreground">If you knock:</span> your email, your answers, your message, any proof link you add, and when you agreed to send it.</li>
        <li><span class="text-foreground">If you make a door:</span> your handle, your name if you give one, the post you paste, your email if you add one, and the answers you send.</li>
        <li><span class="text-foreground">To stop abuse:</span> your IP address, used as a rate-limit key and removed after about a day.</li>
      </ul>
      <p class="text-sm text-muted-foreground">Status links, sign-in links and sessions are stored only as hashes.</p>
    </section>

    <section class="mt-10 space-y-3">
      <h2 class="text-xl">How long we keep it</h2>
      <ul class="list-disc space-y-2 pl-5 text-muted-foreground">
        <li>A knock is deleted {RETAIN_DAYS} days after it is answered or its window ends, with its answers and your email if you have no other knock.</li>
        <li>You can delete your knock sooner from its status link.</li>
        <li>Sign-in links expire after 15 minutes. Sessions end after 7 days without use, and after 30 days at most.</li>
      </ul>
    </section>

    <section class="mt-10" aria-labelledby="processors">
      <h2 id="processors" class="text-xl">Sub-processors</h2>
      <p class="mt-3 text-muted-foreground">These companies process data on Doorbell's behalf.</p>
      <dl class={`mt-4 divide-y ${card}`}>
        {PROCESSORS.map(([name, what]) => (
          <div class="grid gap-1 px-5 py-4 sm:grid-cols-[9rem_1fr] sm:gap-4">
            <dt class="font-medium">{name}</dt>
            <dd class="text-muted-foreground">{what}</dd>
          </div>
        ))}
      </dl>
    </section>
  </Shell>
);
