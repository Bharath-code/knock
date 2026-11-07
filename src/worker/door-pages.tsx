/** @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import css from "../styles/theme.css?url";
import { answerRate, defaultFields, replyLine, templates, WINDOWS, type Template } from "../shared/door";
import type { DoorView, Owner } from "./doors";
import { KnockFormView, StatusBody, type KnockForm } from "./knock-pages";
import type { Status } from "./knocks";

const copyScript = `document.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){var t=document.getElementById(b.dataset.copy);navigator.clipboard.writeText(t.value).then(function(){b.textContent='Copied'});t.select()})})`;

export const Shell = ({ title, description, head, children }: { title: string; description: string; head?: Child; children: Child }) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="stylesheet" href={css} />
      {head}
    </head>
    <body class="bg-paper text-ink">
      <main class="mx-auto max-w-[65ch] px-5 py-10">
        <p class="font-mono text-xs tracking-[.12em] text-brass uppercase">Doorbell</p>
        {children}
      </main>
      <script dangerouslySetInnerHTML={{ __html: copyScript }} />
    </body>
  </html>
);

const input = "mt-1 w-full rounded-md border border-line bg-card p-3";
const button = "min-h-11 rounded-pill bg-brass px-6 font-medium text-on-accent";

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
      <h1 class="mt-3 text-[34px] font-extrabold sm:text-[44px]">{step2 ? "Check your door" : "Make a door"}</h1>
      <p class="mt-3 text-muted">
        {step2 ? "Edit what senders are asked, then create it." : "Paste the post you are about to share. Free, no sign-up."}
      </p>
      {error && <p role="alert" class="mt-5 rounded-md border border-no p-3 text-[15px] text-no">{error}</p>}
      <form method="post" action="/new" class="mt-6 space-y-4">
        {!owner && (
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label for="handle" class="font-medium">Your handle</label>
              <input id="handle" name="handle" value={handle} required minlength={3} maxlength={21} pattern="@?[A-Za-z0-9_]{3,20}" class={input} />
            </div>
            <div>
              <label for="name" class="font-medium">Your name <span class="text-muted">(optional)</span></label>
              <input id="name" name="name" value={name} maxlength={60} class={input} />
            </div>
          </div>
        )}
        {owner && <p class="text-[15px] text-muted">Signed in on this device as <strong class="font-medium text-ink">@{owner.handle}</strong>.</p>}
        <div>
          <label for="post" class="font-medium">Your post</label>
          <textarea id="post" name="post" rows={step2 ? 4 : 7} maxlength={10000} class={input}>{post}</textarea>
        </div>
        {step2 ? (
          <>
            <input type="hidden" name="step" value="create" />
            <div>
              <label for="template" class="font-medium">Type</label>
              <select id="template" name="template" class={input}>
                {templates.map((t) => <option value={t} selected={t === template}>{t[0]!.toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <fieldset class="space-y-3">
              <legend class="font-medium">What senders are asked <span class="text-muted">(up to 3, clear one to drop it)</span></legend>
              {rows.map((f, i) => <input name="field" value={f} maxlength={60} aria-label={`Question ${i + 1}`} class={input} />)}
            </fieldset>
            <div>
              <label for="window" class="font-medium">You will answer within</label>
              <select id="window" name="window" class={input}>
                {WINDOWS.map((w) => <option value={w} selected={w === window}>{w} days</option>)}
              </select>
            </div>
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
      {!step2 && (
        <p class="mt-4 text-[13px] text-muted">
          Leave the post empty to claim only your profile door at /d/{owner?.handle ?? "your-handle"}.
        </p>
      )}
    </Shell>
  );
};

export const doorTitle = (d: DoorView) => (d.kind === "profile" ? `Ask @${d.handle}` : d.post.split(/\n/)[0]!.slice(0, 70));

export const DoorPage = ({ door, url, made, siteKey, source = "bio", form }: { door: DoorView; url: string; made: boolean; siteKey?: string; source?: string; form?: KnockForm }) => {
  const rate = answerRate(door.knocks, door.answered);
  const og = `${url}/og.png`;
  const title = `${doorTitle(door)} | Doorbell`;
  return (
    <Shell
      title={title}
      description={`${door.name || "@" + door.handle} promises an answer within ${door.windowDays} days.`}
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
        <section class="mt-6 rounded-lg border border-line bg-brass-soft p-5" aria-labelledby="live">
          <h2 id="live" class="text-xl font-extrabold">Your door is live</h2>
          <label for="reply" class="mt-3 block text-[15px] font-medium">Paste this in your post or bio</label>
          <input id="reply" readonly value={door.kind === "profile" ? url : replyLine(`${url}?s=reply`)} class={input} />
          <button type="button" data-copy="reply" class={`${button} mt-3`}>Copy</button>
        </section>
      )}
      <p class="mt-6 text-muted">{door.name || `@${door.handle}`} <span class="font-mono text-xs">@{door.handle}</span> is asking</p>
      <h1 class="mt-2 text-[28px] font-extrabold sm:text-[36px]">{door.kind === "profile" ? "Ask me anything. You will get an answer." : "What I am looking for"}</h1>
      {door.kind !== "profile" && <p class="mt-4 whitespace-pre-line">{door.post}</p>}
      <ul class="mt-6 list-disc space-y-1 pl-5 text-[15px]">
        {door.fields.map((f) => <li>{f}</li>)}
      </ul>
      {door.status !== "open" ? (
        <p class="mt-6 font-medium text-no">This door is closed.</p>
      ) : (
        <p class="mt-6 rounded-md border border-line bg-card p-4 font-medium shadow-e-1">
          Every knock is answered within {door.windowDays} days.
          {rate !== null && <span class="mt-1 block font-mono text-xs text-yes">{rate}% answered in time, {door.knocks} knocks</span>}
        </p>
      )}
      {door.status === "open" && <KnockFormView door={door} siteKey={siteKey} source={source} form={form} />}
    </Shell>
  );
};

export const NotFoundDoor = () => (
  <Shell title="No such door | Doorbell" description="This door does not exist.">
    <h1 class="mt-3 text-[34px] font-extrabold">No such door</h1>
    <p class="mt-3 text-muted">Check the link, or <a href="/new">make your own door</a>.</p>
  </Shell>
);

export const StatusPage = ({ s, link }: { s: Status; link: string }) => (
  <Shell title="Your knock | Doorbell" description="Status of your knock." head={<meta name="robots" content="noindex, nofollow" />}>
    <StatusBody s={s} link={link} />
  </Shell>
);
