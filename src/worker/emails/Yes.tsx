import { Cta, H, Layout, P, type Extra } from "./Layout";

export const Yes = ({ who, note, code, url, ...l }: { who: string; note: string | null; code?: string | null; url: string | null } & Extra) => (
  <Layout preview={`${who} said yes to your knock.`} {...l}>
    <H>{who} said yes to your knock.</H>
    {note && <P>{note}</P>}
    {code && <P>Your invite code: <strong>{code}</strong></P>}
    {url && (
      <>
        <P>Pick a time that works:</P>
        <Cta href={url}>Pick a time</Cta>
      </>
    )}
  </Layout>
);
