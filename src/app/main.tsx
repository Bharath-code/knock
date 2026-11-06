import { hc } from "hono/client";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { healthSchema } from "../shared/schema";
import type { Api } from "../worker";
import "../styles/theme.css";

const api = hc<Api>("/api");

const App = () => {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    api.health
      .$get()
      .then((r) => r.json())
      .then((body) => setStatus(healthSchema.parse(body).status))
      .catch(() => setStatus("unreachable"));
  }, []);

  return (
    <main className="mx-auto max-w-[380px] px-5 py-10">
      <h1 className="text-[30px] font-extrabold">Inbox</h1>
      <section className="mt-6 rounded-lg border border-line bg-card p-5 shadow-e-1">
        <h2 className="text-lg font-bold">No knocks yet</h2>
        <p className="mt-2">Post your door link as the first reply under your post.</p>
      </section>
      <p className="mt-4 font-mono text-xs text-muted" role="status">
        api {status}
      </p>
    </main>
  );
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
