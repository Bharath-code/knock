/** @jsxImportSource hono/jsx */
import { ANSWER_LABEL } from "../shared/knock";
import type { DoorView } from "./doors";
import type { Status } from "./knocks";
import { alert, button, card, dot, hint, input as inputBase, label, pill, type Tone } from "../shared/ui";

export type KnockForm = { error?: string; email?: string; message?: string; answers?: string[]; proof?: string };

const input = `${inputBase} mt-1.5`;

// Plain POST works without JS. The script only adds live hints, the improve-and-undo swap and a disabled submit.
const script = `(function(){var f=document.getElementById('knock');if(!f)return;var m=f.elements.message,h=document.getElementById('hints'),b=f.querySelector('[type=submit]'),i=document.getElementById('improve'),u=document.getElementById('undo'),n=document.getElementById('improve-note'),prev=null,t,pend;
function sync(){b.disabled=!f.checkValidity()}f.addEventListener('input',sync);sync();
function hints(){var d=m.value.trim();h.textContent='';if(!d)return;fetch('/api/check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({post:f.dataset.post,draft:d})}).then(function(r){return r.json()}).then(function(r){Object.keys(r).forEach(function(k){if(r[k]&&r[k].ok===false&&r[k].hint){var li=document.createElement('li');li.textContent=r[k].hint+(r[k].found?' '+r[k].found.map(function(x){return x.word+' → '+x.fix}).join(', '):'');h.appendChild(li)}})}).catch(function(){})}
m.addEventListener('input',function(){clearTimeout(t);t=setTimeout(hints,600)});
var wid;function token(){return new Promise(function(ok,no){if(!window.turnstile)return no();pend=ok;if(wid===undefined)wid=turnstile.render('#improve-ts',{sitekey:f.dataset.sitekey,action:'check',execution:'execute',appearance:'interaction-only',callback:function(x){pend&&pend(x)},'error-callback':no});else turnstile.reset(wid);turnstile.execute(wid)})}
if(i){i.hidden=false;i.addEventListener('click',function(){if(!m.value.trim())return;i.disabled=true;n.textContent='';token().then(function(tk){return fetch('/api/check/model',{method:'POST',headers:{'content-type':'application/json','x-turnstile-token':tk},body:JSON.stringify({post:f.dataset.post,draft:m.value})})}).then(function(r){return r.json()}).then(function(r){if(r.rewrite){prev=m.value;m.value=r.rewrite;u.hidden=false;hints();sync()}else n.textContent=r.error||'No improved version for this one. Add facts, then try again.'}).catch(function(){n.textContent='Could not load an improved version.'}).then(function(){i.disabled=false})});u.addEventListener('click',function(){if(prev!==null){m.value=prev;prev=null;u.hidden=true;hints();sync()}})}})();`;

export const KnockFormView = ({ door, siteKey, source, form = {} }: { door: DoorView; siteKey?: string; source: string; form?: KnockForm }) => (
  <section class={`mt-10 p-5 sm:p-8 ${card}`} aria-labelledby="knock-h">
    <h2 id="knock-h" class="text-2xl">Knock on this door</h2>
    <p class="mt-1 text-muted-foreground">Short and specific gets a faster yes.</p>
    {form.error && <p role="alert" class={`mt-5 ${alert}`}>{form.error}</p>}
    <form id="knock" method="post" action={`/d/${door.handle}/${door.slug === "profile" ? "profile" : door.slug}/knock?s=${source}`} data-post={door.post} data-sitekey={siteKey ?? ""} class="mt-6 space-y-6">
      {door.fields.map((q, i) => (
        <div>
          <label for={`a${i}`} class={label}>{q}</label>
          <input id={`a${i}`} name="answer" required maxlength={500} value={form.answers?.[i] ?? ""} class={input} />
        </div>
      ))}
      <div>
        <label for="message" class={label}>Your message</label>
        <textarea id="message" name="message" rows={5} required maxlength={2000} class={input}>{form.message ?? ""}</textarea>
        <ul id="hints" aria-live="polite" class="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground empty:hidden" />
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" id="improve" hidden class={button({ variant: "outline" })}>Use improved version</button>
          <button type="button" id="undo" hidden class={button({ variant: "ghost" })}>Undo</button>
        </div>
        <p id="improve-note" aria-live="polite" class="mt-1 text-sm text-muted-foreground empty:hidden" />
        <div id="improve-ts" />
      </div>
      <div>
        <label for="proof" class={label}>Proof link <span class="font-normal text-muted-foreground">(optional)</span></label>
        <input id="proof" name="proof" type="url" maxlength={300} value={form.proof ?? ""} placeholder="https://" class={input} />
      </div>
      <div>
        <label for="email" class={label}>Your email</label>
        <input id="email" name="email" type="email" required maxlength={254} autocomplete="email" value={form.email ?? ""} class={input} />
        <p class={hint}>No account needed. We email you one status link.</p>
      </div>
      <label class="flex cursor-pointer items-start gap-3 text-sm text-muted-foreground">
        <input type="checkbox" name="consent" required class="mt-0.5 size-5 shrink-0 cursor-pointer" />
        <span>I agree that {door.name || `@${door.handle}`} and Doorbell may store this message and email to deliver and answer it. <a href="/privacy">How we handle it</a>.</span>
      </label>
      {siteKey && <div class="cf-turnstile" data-sitekey={siteKey} data-action="knock" />}
      <button type="submit" class={`${button({ variant: "default", size: "lg" })} w-full sm:w-auto`}>Send knock</button>
    </form>
    {siteKey && <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />}
    <script dangerouslySetInnerHTML={{ __html: script }} />
  </section>
);

const when = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";

type StepState = "done" | "now" | "todo";
const Step = ({ state, tone = "yes", label, at, hint }: { state: StepState; tone?: Tone; label: string; at?: number | null; hint?: string }) => (
  <li class="relative flex gap-4 pb-7 last:pb-0 before:absolute before:top-8 before:bottom-1 before:left-3 before:w-px before:bg-border last:before:hidden">
    <span aria-hidden="true" class={`relative grid size-6 shrink-0 place-content-center rounded-full ${state === "done" ? `${TONE_FILL[tone]} text-white dark:text-background` : state === "now" ? "bg-maybe-soft ring-1 ring-maybe/40" : "border-2 border-input bg-card"}`}>
      {state === "done" && <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
      {state === "now" && <span class="size-2 rounded-full bg-maybe motion-safe:animate-pulse" />}
    </span>
    <span class="min-w-0 pt-0.5">
      <span class="flex flex-wrap items-center gap-2">
        <strong class={`font-medium ${state === "todo" ? "text-muted-foreground" : ""}`}>{label}</strong>
        {state === "now" && <span class={pill("maybe")}>Waiting</span>}
      </span>
      {state === "done" && at ? <time class="block font-mono text-xs text-muted-foreground" datetime={new Date(at).toISOString()}>{when(at)}</time> : <span class="block text-sm text-muted-foreground">{hint}</span>}
    </span>
  </li>
);
const TONE_FILL: Record<Tone, string> = { yes: "bg-yes", later: "bg-later", no: "bg-destructive", maybe: "bg-maybe", brand: "bg-primary", neutral: "bg-muted-foreground" };
const ANSWER_TONE: Record<string, Tone> = { yes: "yes", later: "later", no: "no", expired: "neutral" };

export const StatusBody = ({ s, link }: { s: Status; link: string }) => {
  const closed = s.answeredAt !== null || s.answer === "expired";
  const seen = s.seenAt !== null;
  const tone: Tone = s.answer ? (ANSWER_TONE[s.answer] ?? "neutral") : seen ? "maybe" : "neutral";
  const headline = s.answer ? (ANSWER_LABEL[s.answer] ?? s.answer) : seen ? "Seen, answer on the way" : "Delivered";
  return (
  <>
    <span class={pill(tone)}><span class={dot(tone)} />{headline}</span>
    <h1 class="mt-4 text-3xl">Your knock</h1>
    <p class="mt-3 text-lg text-muted-foreground">To {s.who}: {s.title}</p>
    <ol class={`mt-8 p-5 sm:p-6 ${card}`}>
      <Step state="done" label="Delivered" at={s.createdAt} />
      <Step state={seen ? "done" : "now"} label="Seen" at={s.seenAt} hint="Not seen yet" />
      <Step
        state={closed ? "done" : seen ? "now" : "todo"}
        tone={s.answer ? (ANSWER_TONE[s.answer] ?? "neutral") : "yes"}
        label={s.answer === "expired" ? ANSWER_LABEL.expired! : s.answer ? `Answer: ${ANSWER_LABEL[s.answer] ?? s.answer}` : "Answer"}
        at={s.answeredAt ?? (s.answer === "expired" ? s.expiresAt : null)}
        hint={`You will hear back by ${when(s.expiresAt)}`}
      />
    </ol>
    <p class="mt-4 text-sm text-muted-foreground">Keep this link private: <span class="break-all font-mono">{link}</span></p>
  </>
  );
};
