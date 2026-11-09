/** @jsxImportSource hono/jsx */
import { Shell } from "./door-pages";

import { alert, button as btn, card, input as inputBase, label, notice } from "../shared/ui";

const input = `${inputBase} mt-1.5`;
const button = `${btn({ variant: "default", size: "lg" })} w-full sm:w-auto`;

export const SigninPage = ({ siteKey, sent, error, email = "" }: { siteKey?: string; sent?: boolean; error?: string; email?: string }) => (
  <Shell
    title="Sign in | Doorbell"
    description="Get a sign-in link by email."
    head={
      <>
        <meta name="robots" content="noindex, nofollow" />
        {siteKey && !sent && <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />}
      </>
    }
  >
    <h1 class="text-3xl">Sign in</h1>
    {sent ? (
      <p role="status" class={`mt-6 ${notice}`}>
        If that address can sign in, a link is on its way. It works once and expires in 15 minutes.
      </p>
    ) : (
      <>
        <p class="mt-3 text-lg text-muted-foreground">We email you a link. No password.</p>
        {error && <p role="alert" class={`mt-6 ${alert}`}>{error}</p>}
        <form method="post" action="/signin" class={`mt-8 space-y-6 p-5 sm:p-8 ${card}`}>
          <div>
            <label for="email" class={label}>Email</label>
            <input id="email" name="email" type="email" value={email} required maxlength={254} autocomplete="email" class={input} />
          </div>
          {siteKey && <div class="cf-turnstile" data-sitekey={siteKey} data-action="signin" />}
          <button class={button}>Email me a link</button>
        </form>
      </>
    )}
  </Shell>
);

// Opening the emailed link only shows this page. The sign-in itself needs the button's POST,
// so an email scanner that fetches the link cannot use it up. It also says which account the
// link is for, so a link someone else sent you cannot quietly sign you into their account.
export type Confirm = { email: string; handle: string | null; claim: boolean; replacing: boolean };

export const ConfirmPage = ({ token, error, link }: { token: string; error?: string; link?: Confirm }) => (
  <Shell title="Confirm sign-in | Doorbell" description="Confirm your sign-in." head={<meta name="robots" content="noindex, nofollow" />}>
    <h1 class="text-3xl">{link?.claim ? "Confirm your email" : "Confirm sign-in"}</h1>
    {error || !link ? (
      <>
        <p role="alert" class={`mt-6 ${alert}`}>{error ?? "This link is not valid. Ask for a new one."}</p>
        <a class={`mt-6 ${btn({ variant: "outline" })}`} href="/signin">Get a new link</a>
      </>
    ) : (
      <>
        <p class="mt-3 text-lg">
          {link.claim ? (
            <>Attach <strong>{link.email}</strong> to your door <strong>@{link.handle}</strong>. After this you can sign in with it on any device.</>
          ) : (
            <>Sign in as <strong>{link.email}</strong>.</>
          )}
        </p>
        {link.replacing && <p class={`mt-4 ${notice}`}>This browser is already signed in. Continuing replaces that session. If you did not ask for this link, close this page.</p>}
        <form method="post" action="/signin/confirm" class="mt-6">
          <input type="hidden" name="t" value={token} />
          <button class={button}>{link.claim ? "Confirm email" : "Sign in"}</button>
        </form>
      </>
    )}
  </Shell>
);

export const SeenOffPage = ({ token, valid, done }: { token: string; valid: boolean; done?: boolean }) => (
  <Shell title="Seen alerts | Doorbell" description="Turn off Seen alerts." head={<meta name="robots" content="noindex, nofollow" />}>
    <h1 class="text-3xl">{done ? "Seen alerts are off" : "Turn off Seen alerts?"}</h1>
    {!valid ? (
      <p role="alert" class={`mt-6 ${alert}`}>This link is not valid.</p>
    ) : done ? (
      <p class="mt-3 text-lg text-muted-foreground">You won't get an email when someone opens your knock. You still get their answer.</p>
    ) : (
      <>
        <p class="mt-3 text-lg text-muted-foreground">You'll stop getting an email when someone opens your knock. You still get their answer.</p>
        <form method="post" action={`/u/${token}/seen`} class="mt-8">
          <button class={button}>Turn off Seen alerts</button>
        </form>
      </>
    )}
  </Shell>
);

export const OutcomePage = ({ token, view, done }: { token: string; view: { side: string; who: string; about: string } | null; done?: boolean }) => (
  <Shell title="Did it happen? | Doorbell" description="Tell us how it went." head={<meta name="robots" content="noindex, nofollow" />}>
    <h1 class="text-3xl">{done ? "Thanks, that helps" : "Did it happen?"}</h1>
    {!view ? (
      <p role="alert" class={`mt-6 ${alert}`}>This link is not valid.</p>
    ) : done ? (
      <p class="mt-3 text-lg text-muted-foreground">Your answer is saved. Nothing else to do.</p>
    ) : (
      <>
        <p class="mt-3 text-lg text-muted-foreground">
          {view.side === "sender" ? `${view.who} said yes to your knock on ${view.about}. Did you end up connecting?` : `You said yes to a knock on ${view.about}. Did it lead to a conversation?`}
        </p>
        <form method="post" action={`/o/${token}`} class="mt-8 flex flex-col gap-3 sm:flex-row">
          <button name="happened" value="1" class={button}>Yes, it happened</button>
          <button name="happened" value="0" class={`${btn({ variant: "outline", size: "lg" })} w-full sm:w-auto`}>Not yet, or no</button>
        </form>
      </>
    )}
  </Shell>
);

export const UnsubscribePage =({ token, valid, done }: { token: string; valid: boolean; done?: boolean }) => (
  <Shell title="Email summaries | Doorbell" description="Turn off the daily digest and weekly summary." head={<meta name="robots" content="noindex, nofollow" />}>
    <h1 class="text-3xl">{done ? "You're unsubscribed" : "Turn off the daily and weekly emails?"}</h1>
    {!valid ? (
      <p role="alert" class={`mt-6 ${alert}`}>This link is not valid. You can turn the emails off in your inbox settings.</p>
    ) : done ? (
      <p class="mt-3 text-lg text-muted-foreground">No more daily digests or weekly summaries. Turn it back on any time in your inbox settings.</p>
    ) : (
      <>
        <p class="mt-3 text-lg text-muted-foreground">You'll stop getting the once-a-day email about new knocks and the weekly count of people you answered. Your door and inbox keep working.</p>
        <form method="post" action={`/u/${token}`} class="mt-8">
          <button class={button}>Turn off emails</button>
        </form>
      </>
    )}
    <a class={`mt-6 ${btn({ variant: "outline" })}`} href="/app/settings">Inbox settings</a>
  </Shell>
);
