import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSettings } from "@/lib/data";
import { recipientsFor, logMail, sendMail } from "@/lib/emails";
import { createAndSendSurvey } from "@/lib/survey";
import { esc } from "@/lib/mail";
import { fmtDateTime, hotelToday } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Run every 10-15 minutes (Vercel Cron, Supabase pg_cron + pg_net, or Windows Task Scheduler with curl):
 *   GET /api/cron/alerts   Authorization: Bearer <CRON_SECRET>
 * 1. Overdue tasks -> department escalation contact + Sales (once per task until its status changes)
 * 2. Drafts still unsent 48h before the event -> Sales
 * 3. Events whose last day has passed -> Completed, then client survey (if enabled)
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  const settings = await getSettings(sb);
  const now = new Date().toISOString();
  const result = { overdue: 0, drafts: 0, completed: 0, surveys: 0 };

  // 1. Overdue tasks
  const { data: overdue } = await sb
    .from("event_tasks")
    .select("id, event_id, title, ready_by, status, department_code, departments(name, escalation_email), events!inner(sheet_no, booking_name, status)")
    .lt("ready_by", now)
    .is("alert_sent_at", null)
    .not("status", "in", "(done,na,cancelled)")
    .in("events.status", ["submitted", "confirmed"]);
  const salesTo = await recipientsFor(sb, ["sales"]);
  for (const t of (overdue ?? []) as any[]) {
    const to = [...salesTo, t.departments?.escalation_email, ...(await recipientsFor(sb, [t.department_code]))].filter(Boolean);
    const subject = `OVERDUE: ${t.departments?.name} - ${t.title} (${t.events.booking_name})`;
    const html = `<p><strong>${esc(t.departments?.name)}</strong> has not completed:</p><p>${esc(t.title)}<br>Ready by ${esc(fmtDateTime(t.ready_by))}<br>Status: ${esc(t.status)}</p>
      <p><a href="${process.env.APP_BASE_URL}/sheets/${t.event_id}?tab=followup">Open follow-up</a></p>`;
    await logMail(sb, { event_id: t.event_id, kind: "alert", recipients: to, subject }, () => sendMail({ to, subject, html }));
    await sb.from("event_tasks").update({ alert_sent_at: now }).eq("id", t.id);
    result.overdue++;
  }

  // 2. Drafts close to the event
  const soon = hotelToday(2);
  const { data: drafts } = await sb
    .from("events").select("id, sheet_no, booking_name, event_days!inner(event_date)").eq("status", "draft").lte("event_days.event_date", soon).gte("event_days.event_date", hotelToday());
  for (const d of (drafts ?? []) as any[]) {
    const subject = `Not sent yet: ${d.booking_name} (${d.sheet_no}) is a draft and the event is within 48 hours`;
    const { data: already } = await sb.from("email_log").select("id").eq("event_id", d.id).eq("subject", subject).limit(1);
    if (already?.length) continue;
    await logMail(sb, { event_id: d.id, kind: "alert", recipients: salesTo, subject }, () =>
      sendMail({ to: salesTo, subject, html: `<p>Submit it so departments can prepare: <a href="${process.env.APP_BASE_URL}/sheets/${d.id}/edit">open draft</a></p>` }));
    result.drafts++;
  }

  // 3. Auto-complete finished events and send surveys
  const { data: open } = await sb.from("events").select("id, contact_email, survey_sent_at, event_days(event_date)").in("status", ["submitted", "confirmed"]);
  const today = hotelToday();
  for (const e of (open ?? []) as any[]) {
    const last = (e.event_days ?? []).map((d: any) => d.event_date).sort().pop();
    if (!last || last >= today) continue;
    await sb.from("events").update({ status: "completed" }).eq("id", e.id);
    result.completed++;
    if (settings.survey_enabled && e.contact_email && !e.survey_sent_at) {
      try { await createAndSendSurvey(sb, e.id); result.surveys++; } catch { /* logged in email_log */ }
    }
  }
  return NextResponse.json(result);
}
