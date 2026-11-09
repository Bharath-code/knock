import { Cta, H, Layout, P, c, type Extra } from "./Layout";

export type Top = { door: string; fit: number | null; excerpt: string };

export const Digest = ({ summary, top, inbox, ...l }: { summary: string; top: Top[]; inbox: string } & Extra) => (
  <Layout preview={summary} {...l}>
    <H>{summary}</H>
    {top.length > 0 && (
      <>
        <P>Best fits:</P>
        {top.map((t, i) => (
          <P key={i}>
            <strong>{t.door}</strong>, <span className="muted" style={{ color: c.muted }}>{t.fit == null ? "not scored" : `fit ${t.fit}/5`}</span>
            <br />
            {t.excerpt}
          </P>
        ))}
      </>
    )}
    <Cta href={inbox}>Answer them</Cta>
  </Layout>
);
