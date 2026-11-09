import { Cta, H, Layout, P, type Extra } from "./Layout";

export const Pass = ({ by, toName, note, link, ...l }: { by: string; toName: string; note: string | null; link: string } & Extra) => (
  <Layout preview={`${by} thinks ${toName}'s door fits you better. Nothing is shared until you tap.`} {...l}>
    <H>{by} passed you to {toName}'s door</H>
    {note && <P>"{note}"</P>}
    <P>If you agree, one tap sends your knock to {toName}. Nothing is shared until you do.</P>
    <Cta href={link}>Review and send</Cta>
    <P muted>The link works for 7 days. If you do nothing, your knock stays where it is.</P>
  </Layout>
);
