import { initWasm, Resvg } from "@resvg/resvg-wasm";
import wasm from "@resvg/resvg-wasm/index_bg.wasm";
import bold from "@fontsource/figtree/files/figtree-latin-800-normal.woff?inline";
import type { DoorView } from "./doors";

// resvg reads TTF/OTF only and fontsource ships WOFF, so unwrap it: rebuild the sfnt from the zlib-compressed tables.
const woffToSfnt = async (dataUri: string) => {
  const woff = Uint8Array.from(atob(dataUri.split(",")[1]!), (c) => c.charCodeAt(0));
  const v = new DataView(woff.buffer);
  const n = v.getUint16(12);
  const entries = await Promise.all(
    Array.from({ length: n }, async (_, i) => {
      const at = 44 + i * 20;
      const [offset, comp, orig] = [v.getUint32(at + 4), v.getUint32(at + 8), v.getUint32(at + 12)];
      const raw = woff.subarray(offset, offset + comp);
      const data =
        comp < orig
          ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer())
          : raw;
      return { tag: woff.subarray(at, at + 4), sum: v.getUint32(at + 16), data };
    }),
  );
  const head = 12 + 16 * n;
  const total = entries.reduce((s, e) => s + ((e.data.length + 3) & ~3), head);
  const out = new Uint8Array(total);
  const o = new DataView(out.buffer);
  o.setUint32(0, v.getUint32(4));
  o.setUint16(4, n);
  const sel = Math.floor(Math.log2(n));
  o.setUint16(6, 16 * 2 ** sel);
  o.setUint16(8, sel);
  o.setUint16(10, 16 * n - 16 * 2 ** sel);
  let pos = head;
  entries.forEach((e, i) => {
    out.set(e.tag, 12 + i * 16);
    o.setUint32(12 + i * 16 + 4, e.sum);
    o.setUint32(12 + i * 16 + 8, pos);
    o.setUint32(12 + i * 16 + 12, e.data.length);
    out.set(e.data, pos);
    pos += (e.data.length + 3) & ~3;
  });
  return out;
};

let ready: Promise<Uint8Array> | undefined;
// ponytail: renders per request and relies on the CDN cache; store PNGs in R2 if render time shows up in logs
const init = () => (ready ??= Promise.all([initWasm(wasm), woffToSfnt(bold)]).then(([, font]) => font));

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const wrap = (text: string, width: number, maxLines: number) => {
  const lines: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + w).length > width) {
      lines.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines.length > maxLines
    ? [...lines.slice(0, maxLines - 1), lines[maxLines - 1]!.slice(0, width - 1) + "…"]
    : lines;
};

const text = (x: number, y: number, size: number, fill: string, s: string, extra = "") =>
  `<text x="${x}" y="${y}" font-family="Figtree" font-weight="800" font-size="${size}" fill="${fill}" ${extra}>${esc(s)}</text>`;

const frame = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#f5f6f9"/><rect x="60" y="60" width="1080" height="510" rx="24" fill="#fff" stroke="#e1e4ee" stroke-width="2"/>${text(110, 140, 26, "#946000", "DOORBELL", 'letter-spacing="4"')}${inner}</svg>`;

export const ogSvg = (d: DoorView) => {
  const who = d.name || `@${d.handle}`;
  const body = wrap(d.kind === "profile" ? "Every knock gets an answer." : d.post, 32, 4);
  return frame(
    `${text(110, 215, 34, "#5d6480", `${who} is asking`)}${body.map((l, i) => text(110, 300 + i * 62, 52, "#141829", l)).join("")}${text(110, 530, 30, "#0b7a57", `Answered within ${d.windowDays} days, guaranteed`)}`,
  );
};

const int = (v: string | undefined, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : min;
};

export const scoreSvg = (fit?: string) => {
  const n = int(fit, 1, 5);
  const ring = (i: number) => `<circle cx="${620 + i * 90}" cy="340" r="32" fill="${i < n ? "#946000" : "#e1e4ee"}"/>`;
  return frame(
    `${text(110, 230, 34, "#5d6480", "My ask scored")}${text(110, 420, 160, "#141829", `${n}/5`)}${[0, 1, 2, 3, 4].map(ring).join("")}${text(110, 530, 30, "#0b7a57", "Checked on Doorbell")}`,
  );
};

export const answeredSvg = (count?: string, minutes?: string) => {
  const n = int(count, 1, 999);
  const m = int(minutes, 0, 99_999);
  const took = m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`;
  return frame(
    `${text(110, 230, 34, "#5d6480", "All answered")}${text(110, 400, 140, "#141829", `${n} ${n === 1 ? "person" : "people"}`)}${text(110, 470, 40, "#5d6480", `got closure in ${took}`)}${text(110, 530, 30, "#0b7a57", "Every knock gets an answer")}`,
  );
};

const png = async (svg: string) => {
  const font = await init();
  return new Resvg(svg, { font: { fontBuffers: [font], defaultFontFamily: "Figtree", loadSystemFonts: false } }).render().asPng();
};

export const ogPng = (d: DoorView) => png(ogSvg(d));
export const scorePng = (fit?: string) => png(scoreSvg(fit));
export const answeredPng = (count?: string, minutes?: string) => png(answeredSvg(count, minutes));
