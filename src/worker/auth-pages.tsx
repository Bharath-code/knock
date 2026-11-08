/** @jsxImportSource hono/jsx */
import { Shell } from "./door-pages";

const input = "mt-1 w-full rounded-md border border-line bg-card p-3";
const button = "min-h-11 rounded-pill bg-brass px-6 font-medium text-on-accent";

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
    <h1 class="mt-3 text-[34px] font-extrabold">Sign in</h1>
    {sent ? (
      <p role="status" class="mt-5 rounded-md border border-line bg-card p-4">
        If that address can sign in, a link is on its way. It works once and expires in 15 minutes.
      </p>
    ) : (
      <>
        <p class="mt-3 text-muted">We email you a link. No password.</p>
        {error && <p role="alert" class="mt-5 rounded-md border border-no p-3 text-[15px] text-no">{error}</p>}
        <form method="post" action="/signin" class="mt-6 space-y-4">
          <div>
            <label for="email" class="font-medium">Email</label>
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
    <h1 class="mt-3 text-[34px] font-extrabold">{link?.claim ? "Confirm your email" : "Confirm sign-in"}</h1>
    {error || !link ? (
      <>
        <p role="alert" class="mt-5 rounded-md border border-no p-3 text-[15px] text-no">{error ?? "This link is not valid. Ask for a new one."}</p>
        <p class="mt-4"><a class="text-brass-ink underline" href="/signin">Get a new link</a></p>
      </>
    ) : (
      <>
        <p class="mt-3">
          {link.claim ? (
            <>Attach <strong>{link.email}</strong> to your door <strong>@{link.handle}</strong>. After this you can sign in with it on any device.</>
          ) : (
            <>Sign in as <strong>{link.email}</strong>.</>
          )}
        </p>
        {link.replacing && <p class="mt-3 rounded-md border border-line bg-card p-3 text-[15px]">This browser is already signed in. Continuing replaces that session. If you did not ask for this link, close this page.</p>}
        <form method="post" action="/signin/confirm" class="mt-6">
          <input type="hidden" name="t" value={token} />
          <button class={button}>{link.claim ? "Confirm email" : "Sign in"}</button>
        </form>
      </>
    )}
  </Shell>
);
