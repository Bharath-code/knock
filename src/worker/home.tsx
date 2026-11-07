/** @jsxImportSource hono/jsx */
import css from "../styles/theme.css?url";

export const Home = () => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Doorbell: every knock gets an answer</title>
      <meta
        name="description"
        content="A door link for your bio or first reply. People ask in three short fields, you answer in one tap."
      />
      <link rel="stylesheet" href={css} />
    </head>
    <body class="bg-paper text-ink">
      <main class="mx-auto max-w-[65ch] px-5 py-16">
        <p class="font-mono text-xs tracking-[.12em] text-brass uppercase">Doorbell</p>
        <h1 class="mt-3 text-[44px] font-extrabold">Every knock gets an answer.</h1>
        <p class="mt-5">
          A door link for your bio or first reply. People ask in three short fields, you answer in
          one tap, and nobody is left waiting.
        </p>
        <p class="mt-5 text-[13px] font-medium text-muted">
          Being built now. <a href="/check">Try the free DM checker.</a>
        </p>
      </main>
    </body>
  </html>
);
