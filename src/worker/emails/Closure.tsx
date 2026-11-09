import { H, Layout, P, type Extra } from "./Layout";

export const Closure = ({ who, message, later, expired, again, ...l }: { who: string; message: string; later?: boolean; expired?: boolean; again?: string } & Extra) => (
  <Layout preview={message} {...l}>
    <H>{expired ? `${who} didn't get to your knock` : later ? `${who} replied to your knock` : `${who} closed your knock`}</H>
    <P>{message}</P>
    {!expired && <P muted>({who} answered through Doorbell.)</P>}
    {later && again && <P>You can knock again from {again}. We'll email you then.</P>}
  </Layout>
);
