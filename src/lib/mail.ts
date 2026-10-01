import "server-only";

export interface Mail { to: string[]; subject: string; html: string }

let tokenCache: { token: string; exp: number } | null = null;

async function graphToken() {
  if (tokenCache && tokenCache.exp > Date.now() + 60000) return tokenCache.token;
  const res = await fetch(`https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GRAPH_CLIENT_ID!,
      client_secret: process.env.GRAPH_CLIENT_SECRET!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Graph token failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  tokenCache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return tokenCache.token;
}

/** Sends through Microsoft 365 (Graph sendMail) so mail comes from the hotel's own Outlook mailbox. */
export async function sendMail(m: Mail): Promise<"sent" | "logged"> {
  const to = Array.from(new Set(m.to.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  if (!to.length) return "logged";
  if (process.env.MAIL_PROVIDER !== "graph") {
    console.log(`[mail:console] to=${to.join(", ")} subject="${m.subject}"`);
    return "logged";
  }
  const token = await graphToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(process.env.GRAPH_SENDER!)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: m.subject,
        body: { contentType: "HTML", content: m.html },
        toRecipients: to.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    }),
  });
  if (!res.ok) throw new Error(`Graph sendMail failed: ${res.status} ${await res.text()}`);
  return "sent";
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
