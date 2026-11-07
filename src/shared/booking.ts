const HOSTS = ["cal.com", "calendly.com"];

export const YES_DELAY_S = 10;

export const bookingUrl = (s: unknown): string | null => {
  if (typeof s !== "string" || s.length > 300) return null;
  try {
    const u = new URL(s.trim());
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`)) ? u.href : null;
  } catch {
    return null;
  }
};
