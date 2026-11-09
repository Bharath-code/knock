import { Cta, H, Layout, P, type Extra } from "./Layout";

export const Weekly = ({ summary, inbox, ...l }: { summary: string; inbox: string } & Extra) => (
  <Layout preview={summary} cadence="at most once a week, only when you answered someone" {...l}>
    <H>{summary}</H>
    <P>Every one of them got a real reply instead of silence.</P>
    <Cta href={inbox}>Open your inbox</Cta>
  </Layout>
);
