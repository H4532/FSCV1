import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSettings } from "./data";
import { logMail, sendMail } from "./emails";
import { esc } from "./mail";

export async function createAndSendSurvey(sb: SupabaseClient, eventId: string) {
  const { data: ev } = await sb.from("events").select("contact_email, contact_name, booking_name, sheet_no").eq("id", eventId).single();
  if (!ev?.contact_email) throw new Error("The sheet has no client contact email.");
  const settings = await getSettings(sb);
  const { data: s, error } = await sb.from("client_surveys").insert({ event_id: eventId }).select("token").single();
  if (error || !s) throw new Error(error?.message ?? "Could not create the survey.");
  const url = `${process.env.APP_BASE_URL}/survey/${s.token}`;
  const subject = `How was your event at ${settings.hotel.name}?`;
  const html = `<p>Dear ${esc(ev.contact_name || "guest")},</p>
    <p>Thank you for holding ${esc(ev.booking_name)} with us. Could you rate the venue, food and service? It takes under a minute.</p>
    <p><a href="${url}">Rate your event</a></p><p>${esc(settings.hotel.name)}</p>`;
  await logMail(sb, { event_id: eventId, kind: "survey", recipients: [ev.contact_email], subject }, () =>
    sendMail({ to: [ev.contact_email], subject, html })
  );
  await sb.from("events").update({ survey_sent_at: new Date().toISOString() }).eq("id", eventId);
}

