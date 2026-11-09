import { expect, test } from "bun:test";
import { GUIDES, robotsTxt, sitemapXml } from "../shared/seo";
import { GuidePage, GuidesIndex } from "./seo-pages";

const o = "https://d.test";

test("10 guides with unique slugs, titles, descriptions and copy", () => {
  expect(GUIDES).toHaveLength(10);
  for (const k of ["slug", "title", "description", "example", "mistake", "intro"] as const) expect(new Set(GUIDES.map((x) => x[k])).size).toBe(10);
});

test("each guide links to /check, has canonical and no script", async () => {
  for (const x of GUIDES) {
    const html = String(await GuidePage({ guide: x, origin: o }));
    expect(html).toContain('href="/check"');
    expect(html).toContain(`<link rel="canonical" href="${o}/guides/${x.slug}"`);
    expect(html).toContain(`<title>${x.title} | Doorbell</title>`);
    expect(html).not.toContain("<script");
  }
});

test("index lists every guide; sitemap lists all 10 and robots points to it", async () => {
  const html = String(await GuidesIndex({ origin: o }));
  const map = sitemapXml(o);
  for (const x of GUIDES) {
    expect(html).toContain(`/guides/${x.slug}`);
    expect(map).toContain(`<loc>${o}/guides/${x.slug}</loc>`);
  }
  expect(robotsTxt(o)).toContain(`Sitemap: ${o}/sitemap.xml`);
});
