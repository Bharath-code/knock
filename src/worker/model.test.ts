import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import Anthropic from "@anthropic-ai/sdk";
import { costUsd, fitBand, MODEL, scoreDraft } from "./model";

const good = { fit: 4, tips: ["Name the role."], rewrite: "6 yrs in Go. See a.dev. Open to a call?" };

const reply = (parsed_output: unknown, stop_reason = "end_turn") => ({
  model: MODEL,
  stop_reason,
  parsed_output,
  usage: { input_tokens: 1000, output_tokens: 200 },
});

const stub = (...replies: unknown[]) => {
  const calls: any[] = [];
  const client = {
    messages: {
      parse: async (params: unknown) => {
        calls.push(params);
        const next = replies.shift();
        if (next instanceof Error) throw next;
        return next;
      },
    },
  } as unknown as Pick<Anthropic, "messages">;
  return { client, calls };
};

const input = { post: "Hiring backend", draft: "6 yrs in Go" };
let log: ReturnType<typeof spyOn>;
const logged = () => JSON.parse(log.mock.calls.at(-1)![0] as string);

beforeEach(() => {
  log = spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => log.mockRestore());

describe("scoreDraft", () => {
  test("returns the parsed check", async () => {
    const { client } = stub(reply(good));
    expect(await scoreDraft(client, input)).toEqual({ ok: true, check: good });
  });

  test("asks for the right model and no sampling params", async () => {
    const { client, calls } = stub(reply(good));
    await scoreDraft(client, input);
    expect(calls[0].model).toBe("claude-haiku-5-5");
    expect(calls[0].output_config.effort).toBe("low");
    expect(calls[0].thinking).toEqual({ type: "disabled" });
    expect(calls[0].temperature).toBeUndefined();
  });

  test("keeps sender text inside data tags, not the system prompt", async () => {
    const { client, calls } = stub(reply(good));
    await scoreDraft(client, { post: "P-TEXT", draft: "D-TEXT" });
    expect(calls[0].system).not.toContain("D-TEXT");
    expect(calls[0].messages[0].content).toBe("<post>P-TEXT</post>\n<draft>D-TEXT</draft>");
  });

  test("caps tips at three", async () => {
    const { client } = stub(reply({ ...good, tips: ["a", "b", "c", "d"] }));
    const r = await scoreDraft(client, input);
    expect(r.ok && r.check.tips).toEqual(["a", "b", "c"]);
  });

  test("drops an overlong rewrite but keeps the score and tips, with one call", async () => {
    const { client, calls } = stub(reply({ ...good, rewrite: "x".repeat(400) }));
    expect(await scoreDraft(client, input)).toEqual({ ok: true, check: { ...good, rewrite: "" } });
    expect(calls).toHaveLength(1);
    expect(logged().rewrite_dropped).toBe(true);
  });

  test("keeps a rewrite of 399 characters", async () => {
    const rewrite = "x".repeat(399);
    const r = await scoreDraft(stub(reply({ ...good, rewrite })).client, input);
    expect(r.ok && r.check.rewrite).toBe(rewrite);
  });

  test("never returns a rewrite below fit 3, even if the model writes one", async () => {
    for (const fit of [1, 2]) {
      const r = await scoreDraft(stub(reply({ ...good, fit, rewrite: "I have Go experience." })).client, input);
      expect(r.ok && r.check.rewrite).toBe("");
    }
    expect(logged().rewrite_dropped).toBeUndefined();
  });

  test("rejects a score outside 1 to 5 without retrying", async () => {
    const { client, calls } = stub(reply({ ...good, fit: 9 }));
    expect(await scoreDraft(client, input)).toEqual({ ok: false, reason: "invalid_output" });
    expect(calls).toHaveLength(1);
  });

  test("rejects a missing parse result", async () => {
    expect(await scoreDraft(stub(reply(null)).client, input)).toEqual({ ok: false, reason: "invalid_output" });
  });

  test("does not retry a refusal", async () => {
    const { client, calls } = stub(reply(null, "refusal"));
    expect(await scoreDraft(client, input)).toEqual({ ok: false, reason: "refusal" });
    expect(calls).toHaveLength(1);
  });

  test("reports truncation", async () => {
    const { client } = stub(reply(null, "max_tokens"));
    expect(await scoreDraft(client, input)).toEqual({ ok: false, reason: "truncated" });
  });

  test("maps API errors to a reason", async () => {
    const headers = new Headers();
    const { client } = stub(new Anthropic.RateLimitError(429, {}, "slow down", headers));
    expect(await scoreDraft(client, input)).toEqual({ ok: false, reason: "rate_limited" });
  });

  test("logs cost and model but never the draft", async () => {
    const { client } = stub(reply(good));
    await scoreDraft(client, { post: "SECRET-POST", draft: "SECRET-DRAFT" });
    const line = log.mock.calls.at(-1)![0] as string;
    expect(line).not.toContain("SECRET");
    expect(logged()).toMatchObject({ event: "check_model", model: MODEL, outcome: "ok", fit: 4 });
    expect(logged().cost_usd).toBeCloseTo(0.0002, 6);
  });
});

test("costUsd uses the Haiku 5.5 rates", () => {
  expect(costUsd({ input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(0.1, 6);
  expect(costUsd({ input_tokens: 0, output_tokens: 1_000_000 })).toBeCloseTo(0.5, 6);
});

test("fitBand splits low, mid and high", () => {
  expect([1, 2, 3, 4, 5].map(fitBand)).toEqual(["low", "low", "mid", "high", "high"]);
});
