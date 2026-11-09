import { Body, Button, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

export const c = { brass: "#ba4e00", bg: "#f6f4f0", card: "#ffffff", ink: "#24211c", muted: "#6b655b", line: "#e4e0d8" };

const dark = `
:root{color-scheme:light dark;supported-color-schemes:light dark}
@media (prefers-color-scheme:dark){
.bg,.bg>table>tbody>tr>td{background-color:#171614!important}
.card{background-color:#222120!important;border-color:#37342f!important}
.ink{color:#f1eee8!important}
.muted{color:#b5afa4!important}
.line{border-color:#37342f!important}
.hd{background-color:#f5a33a!important}
.hdt{color:#25170d!important}
.btn{background-color:#f5a33a!important;color:#25170d!important}
.lnk{color:#f5a33a!important}
}`;

export const H = ({ children }: { children: ReactNode }) => (
  <Text className="ink" style={{ margin: "0 0 16px", fontSize: 20, lineHeight: "28px", fontWeight: 600, color: c.ink }}>{children}</Text>
);
export const P = ({ children, muted }: { children: ReactNode; muted?: boolean }) => (
  <Text className={muted ? "muted" : "ink"} style={{ margin: "0 0 16px", fontSize: muted ? 13 : 15, lineHeight: muted ? "20px" : "24px", color: muted ? c.muted : c.ink, whiteSpace: "pre-line" }}>{children}</Text>
);
export const Cta = ({ href, children }: { href: string; children: ReactNode }) => (
  <Button className="btn" href={href} style={{ backgroundColor: c.brass, color: "#ffffff", fontSize: 15, fontWeight: 600, padding: "12px 20px", borderRadius: 8, textDecoration: "none", display: "inline-block", margin: "0 0 16px" }}>{children}</Button>
);

export type LayoutProps = { preview: string; children: ReactNode; talk?: string; ownDoor?: string; unsubscribe?: string; cadence?: string };
export type Extra = Omit<LayoutProps, "preview" | "children">;

export const Layout = ({ preview, children, talk, ownDoor, unsubscribe, cadence = "at most once a day, only when there are new knocks" }: LayoutProps) => (
  <Html lang="en">
    <Head>
      <meta name="color-scheme" content="light dark" />
      <meta name="supported-color-schemes" content="light dark" />
      <style>{dark}</style>
    </Head>
    <Preview>{preview}</Preview>
    <Body className="bg" style={{ margin: 0, padding: "24px 12px", backgroundColor: c.bg, fontFamily: "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif" }}>
      <Container style={{ maxWidth: 560, margin: "0 auto" }}>
        <Section className="hd" style={{ backgroundColor: c.brass, borderRadius: "10px 10px 0 0", padding: "14px 24px" }}>
          <Text className="hdt" style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: "0.02em", color: "#ffffff" }}>Doorbell</Text>
        </Section>
        <Section className="card" style={{ backgroundColor: c.card, border: `1px solid ${c.line}`, borderTop: 0, borderRadius: "0 0 10px 10px", padding: "24px" }}>
          {children}
          {(talk || ownDoor || unsubscribe) && <Hr className="line" style={{ borderColor: c.line, margin: "8px 0 16px" }} />}
          {unsubscribe && (
            <P muted>
              You get this {cadence}. <Link className="lnk" href={unsubscribe} style={{ color: c.brass }}>Turn it off</Link>.
            </P>
          )}
          {talk && (
            <P muted>
              Question or problem? <Link className="lnk" href={talk} style={{ color: c.brass }}>Talk to Bharath</Link>, I reply within 24 hours.
            </P>
          )}
          {ownDoor && (
            <P muted>
              Get every request answered on your own posts: <Link className="lnk" href={ownDoor} style={{ color: c.brass }}>open your own door</Link>.
            </P>
          )}
        </Section>
      </Container>
    </Body>
  </Html>
);
