import { Cta, H, Layout, P, type Extra } from "./Layout";

export const Receipt = ({ who, days, link, ...l }: { who: string; days: number; link: string } & Extra) => (
  <Layout preview={`They have promised an answer within ${days} days.`} {...l}>
    <H>Your knock was delivered to {who}.</H>
    <P>They have promised an answer within {days} days. Follow it here:</P>
    <Cta href={link}>Follow your knock</Cta>
    <P muted>Keep this link private. Anyone with it can see the status.</P>
  </Layout>
);
