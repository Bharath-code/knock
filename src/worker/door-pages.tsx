/** @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import css from "../styles/theme.css?url";
import { alert, button as btn, card, hint, input, label } from "../shared/ui";
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

export const Shell = ({ title, description, head, wide, copy, children }: { title: string; description: string; head?: Child; wide?: boolean; copy?: boolean; children: Child }) => (
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
      <footer class="mt-auto border-t border-line">
        <p class="mx-auto max-w-5xl px-4 py-6 text-sm text-muted-foreground sm:px-6">Doorbell. Every knock gets an answer.</p>
      </footer>
      {copy && <script dangerouslySetInnerHTML={{ __html: copyScript }} />}
    </body>
  </html>
);

const button = btn({ variant: "default", size: "lg" });
const field = `${input} mt-1.5`;

export type NewState = {
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

export const NewDoorPage = ({ owner, siteKey, post = "", handle = "", name = "", template, fields, window = 7, error }: NewState) => {
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
      {error && <p role="alert" class={`mt-6 ${alert}`}>{error}</p>}
      <form method="post" action="/new" class={`mt-8 space-y-6 p-5 sm:p-8 ${card}`}>
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
            <input id="reply" readonly value={door.kind === "profile" ? url : replyLine(`${url}?s=reply`)} class={`${input} font-mono text-sm`} />
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

export const StatusPage = ({ s, link }: { s: Status; link: string }) => (
  <Shell title="Your knock | Doorbell" description="Status of your knock." head={<meta name="robots" content="noindex, nofollow" />}>
    <StatusBody s={s} link={link} />
  </Shell>
);
