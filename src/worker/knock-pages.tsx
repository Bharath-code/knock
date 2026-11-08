/** @jsxImportSource hono/jsx */
import { ANSWER_LABEL } from "../shared/knock";
import type { DoorView } from "./doors";
import type { Status } from "./knocks";

export type KnockForm = { error?: string; email?: string; message?: string; answers?: string[]; proof?: string };

const input = "mt-1 w-full rounded-md border border-line bg-card p-3";

// Plain POST works without JS. The script only adds live hints, the improve-and-undo swap and a disabled submit.
const script = `(function(){var f=document.getElementById('knock');if(!f)return;var m=f.elements.message,h=document.getElementById('hints'),b=f.querySelector('[type=submit]'),i=document.getElementById('improve'),u=document.getElementById('undo'),n=document.getElementById('improve-note'),prev=null,t,pend;
function sync(){b.disabled=!f.checkValidity()}f.addEventListener('input',sync);sync();
function hints(){var d=m.value.trim();h.textContent='';if(!d)return;fetch('/api/check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({post:f.dataset.post,draft:d})}).then(function(r){return r.json()}).then(function(r){Object.keys(r).forEach(function(k){if(r[k]&&r[k].ok===false&&r[k].hint){var li=document.createElement('li');li.textContent=r[k].hint+(r[k].found?' '+r[k].found.map(function(x){return x.word+' → '+x.fix}).join(', '):'');h.appendChild(li)}})}).catch(function(){})}
m.addEventListener('input',function(){clearTimeout(t);t=setTimeout(hints,600)});
var wid;function token(){return new Promise(function(ok,no){if(!window.turnstile)return no();pend=ok;if(wid===undefined)wid=turnstile.render('#improve-ts',{sitekey:f.dataset.sitekey,action:'check',execution:'execute',appearance:'interaction-only',callback:function(x){pend&&pend(x)},'error-callback':no});else turnstile.reset(wid);turnstile.execute(wid)})}
if(i){i.hidden=false;i.addEventListener('click',function(){if(!m.value.trim())return;i.disabled=true;n.textContent='';token().then(function(tk){return fetch('/api/check/model',{method:'POST',headers:{'content-type':'application/json','x-turnstile-token':tk},body:JSON.stringify({post:f.dataset.post,draft:m.value})})}).then(function(r){return r.json()}).then(function(r){if(r.rewrite){prev=m.value;m.value=r.rewrite;u.hidden=false;hints();sync()}else n.textContent=r.error||'No improved version for this one. Add facts, then try again.'}).catch(function(){n.textContent='Could not load an improved version.'}).then(function(){i.disabled=false})});u.addEventListener('click',function(){if(prev!==null){m.value=prev;prev=null;u.hidden=true;hints();sync()}})}})();`;

export const KnockFormView = ({ door, siteKey, source, form = {} }: { door: DoorView; siteKey?: string; source: string; form?: KnockForm }) => (
  <section class="mt-8 rounded-lg border border-line bg-card p-5 shadow-e-1" aria-labelledby="knock-h">
    <h2 id="knock-h" class="text-2xl font-extrabold">Knock on this door</h2>
    {form.error && <p role="alert" class="mt-3 rounded-md border border-no p-3 text-[15px] text-no">{form.error}</p>}
    <form id="knock" method="post" action={`/d/${door.handle}/${door.slug === "profile" ? "profile" : door.slug}/knock?s=${source}`} data-post={door.post} data-sitekey={siteKey ?? ""} class="mt-4 space-y-4">
      {door.fields.map((q, i) => (
        <div>
          <label for={`a${i}`} class="font-medium">{q}</label>
          <input id={`a${i}`} name="answer" required maxlength={500} value={form.answers?.[i] ?? ""} class={input} />
        </div>
      ))}
      <div>
        <label for="message" class="font-medium">Your message</label>
        <textarea id="message" name="message" rows={5} required maxlength={2000} class={input}>{form.message ?? ""}</textarea>
        <ul id="hints" aria-live="polite" class="mt-2 list-disc space-y-1 pl-5 text-[14px] text-muted" />
        <div class="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" id="improve" hidden class="min-h-11 rounded-pill border border-line px-4 text-[15px] font-medium">Use improved version</button>
          <button type="button" id="undo" hidden class="min-h-11 rounded-pill px-4 text-[15px] font-medium text-muted underline">Undo</button>
        </div>
        <p id="improve-note" aria-live="polite" class="mt-1 text-[13px] text-muted" />
        <div id="improve-ts" />
      </div>
      <div>
        <label for="proof" class="font-medium">Proof link <span class="text-muted">(optional)</span></label>
        <input id="proof" name="proof" type="url" maxlength={300} value={form.proof ?? ""} class={input} />
      </div>
      <div>
        <label for="email" class="font-medium">Your email</label>
        <input id="email" name="email" type="email" required maxlength={254} autocomplete="email" value={form.email ?? ""} class={input} />
        <p class="mt-1 text-[13px] text-muted">No account needed. We email you one status link.</p>
      </div>
      <label class="flex items-start gap-3 text-[14px]">
        <input type="checkbox" name="consent" required class="mt-1 size-5" />
        <span>I agree that {door.name || `@${door.handle}`} and Doorbell may store this message and email to deliver and answer it.</span>
      </label>
      {siteKey && <div class="cf-turnstile" data-sitekey={siteKey} data-action="knock" />}
      <button type="submit" class="min-h-11 w-full rounded-pill bg-brass px-6 font-medium text-on-accent disabled:opacity-50 sm:w-auto">Send knock</button>
    </form>
    {siteKey && <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />}
    <script dangerouslySetInnerHTML={{ __html: script }} />
  </section>
);

const when = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";

const Step = ({ done, label, at, hint }: { done: boolean; label: string; at?: number | null; hint?: string }) => (
  <li class="flex gap-3 py-3">
    <span aria-hidden="true" class={`mt-1 size-3 shrink-0 rounded-full ${done ? "bg-yes" : "border-2 border-line"}`} />
    <span>
      <strong class={`font-medium ${done ? "" : "text-muted"}`}>{label}</strong>
      {done && at ? <time class="block font-mono text-xs text-muted" datetime={new Date(at).toISOString()}>{when(at)}</time> : <span class="block text-[13px] text-muted">{hint}</span>}
    </span>
  </li>
);

export const StatusBody = ({ s, link }: { s: Status; link: string }) => (
  <>
    <h1 class="mt-3 text-[34px] font-extrabold">Your knock</h1>
    <p class="mt-3 text-muted">To {s.who}: {s.title}</p>
    <ol class="mt-6 divide-y divide-line rounded-lg border border-line bg-card px-5 shadow-e-1">
      <Step done label="Delivered" at={s.createdAt} />
      <Step done={s.seenAt !== null} label="Seen" at={s.seenAt} hint="Not seen yet" />
      <Step
        done={s.answeredAt !== null || s.answer === "expired"}
        label={s.answer === "expired" ? ANSWER_LABEL.expired! : s.answer ? `Answer: ${ANSWER_LABEL[s.answer] ?? s.answer}` : "Answer"}
        at={s.answeredAt ?? (s.answer === "expired" ? s.expiresAt : null)}
        hint={`You will hear back by ${when(s.expiresAt)}`}
      />
    </ol>
    <p class="mt-4 text-[13px] text-muted">Keep this link private: <span class="break-all font-mono">{link}</span></p>
  </>
);
