import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { SheetDocument } from "@/components/SheetDocument";
import { SheetActions } from "@/components/SheetActions";
import { FollowUp, type TaskRow } from "@/components/FollowUp";
import { Feedback, type FeedbackRow } from "@/components/Feedback";
import { ReadinessBar, SheetChip } from "@/components/Status";
import { requireUser, getDepartments, getSettings, loadSnapshot } from "@/lib/data";
import { fmtDate, fmtDateTime } from "@/lib/time";
import type { TaskStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "sheet", label: "Sheet" },
  { key: "followup", label: "Follow-up" },
  { key: "feedback", label: "Feedback & materials" },
  { key: "log", label: "Revisions & log" },
];

export default async function SheetPage({ params, searchParams }: { params: { id: string }; searchParams: { tab?: string } }) {
  const { sb, user, profile } = await requireUser();
  const snap = await loadSnapshot(sb, params.id);
  if (!snap) notFound();
  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "sheet";

  const [settings, departments, { data: ev }, { data: tasks }, { data: acks }] = await Promise.all([
    getSettings(sb),
    getDepartments(sb),
    sb.from("events").select("survey_sent_at, cancelled_reason, created_at, submitted_at").eq("id", params.id).single(),
    sb.from("event_tasks")
      .select("*, event_days(event_date), task_updates(new_status, comment, eta, created_at, profiles(full_name))")
      .eq("event_id", params.id)
      .order("ready_by"),
    sb.from("acknowledgements").select("department_code, rev_no, acknowledged_at, profiles(full_name)").eq("event_id", params.id),
  ]);
  const deptNames = Object.fromEntries(departments.map((d) => [d.code, d.name]));

  const taskRows: TaskRow[] = (tasks ?? []).map((t: any) => ({
    id: t.id, event_id: t.event_id, department_code: t.department_code, title: t.title, detail: t.detail,
    ready_by: t.ready_by, status: t.status, eta: t.eta, status_comment: t.status_comment, changed_in_rev: t.changed_in_rev,
    event_date: t.event_days?.event_date ?? null,
    updates: [...(t.task_updates ?? [])]
      .sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))
      .map((u: any) => ({ new_status: u.new_status, comment: u.comment, eta: u.eta, created_at: u.created_at, user: u.profiles?.full_name ?? null })),
  }));
  taskRows.sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? "") || a.department_code.localeCompare(b.department_code));

  const involved = Array.from(new Set(taskRows.map((t) => t.department_code)));
  const ackNow = (acks ?? []).filter((a: any) => a.rev_no === snap.revision);
  const myAck = !!profile.department_code && ackNow.some((a: any) => a.department_code === profile.department_code);
  const isSales = ["admin", "sales"].includes(profile.role);

  return (
    <Shell>
      <div className="no-print mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{snap.sheet_no}, Rev {snap.revision || "-"}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{snap.booking_name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <SheetChip status={snap.status} />
            {snap.days.map((d) => fmtDate(d.event_date)).join(", ")}
            {ev?.cancelled_reason && <span className="text-st-cancelled">Cancelled: {ev.cancelled_reason}</span>}
          </p>
        </div>
        <SheetActions id={params.id} status={snap.status} role={profile.role} acknowledged={myAck}
          hasDept={!!profile.department_code && involved.includes(profile.department_code)}
          hasContactEmail={!!snap.contact_email} surveySent={!!ev?.survey_sent_at} />
      </div>

      {taskRows.length > 0 && (
        <div className="no-print mb-4 max-w-md"><ReadinessBar statuses={taskRows.map((t) => t.status as TaskStatus)} /></div>
      )}

      <nav className="no-print mb-5 flex gap-1 border-b border-line" aria-label="Sheet sections">
        {TABS.map((t) => (
          <Link key={t.key} href={`?tab=${t.key}`} scroll={false}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-corniche font-semibold text-corniche" : "border-transparent text-muted hover:text-ink"}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "sheet" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
          <SheetDocument s={snap} hotelName={settings.hotel.name} departments={departments} />
          <aside className="no-print panel h-fit p-4">
            <h2 className="section-title mb-2">Acknowledged (Rev {snap.revision})</h2>
            {!involved.length && <p className="text-sm text-muted">Sent to departments when submitted.</p>}
            <ul className="space-y-1.5 text-sm">
              {involved.map((code) => {
                const a: any = ackNow.find((x: any) => x.department_code === code);
                return (
                  <li key={code} className="flex justify-between gap-2">
                    <span>{deptNames[code] ?? code}</span>
                    {a ? <span className="text-right text-xs text-st-done">{a.profiles?.full_name}<br />{fmtDateTime(a.acknowledged_at)}</span>
                       : <span className="text-xs text-st-issue">Waiting</span>}
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      )}

      {tab === "followup" && (
        <FollowUp tasks={taskRows} departments={deptNames}
          editableDepts={isSales ? "all" : profile.department_code ? [profile.department_code] : []} />
      )}

      {tab === "feedback" && <FeedbackTab eventId={params.id} sb={sb} userId={user.id} profile={profile} deptNames={deptNames} editHours={settings.feedback_edit_hours} />}

      {tab === "log" && <LogTab eventId={params.id} sb={sb} deptNames={deptNames} acks={acks ?? []} />}
    </Shell>
  );
}

async function FeedbackTab({ eventId, sb, userId, profile, deptNames, editHours }: any) {
  const [{ data: fb }, { data: files }] = await Promise.all([
    sb.from("event_feedback").select("*, profiles(full_name)").eq("event_id", eventId).order("created_at", { ascending: false }),
    sb.from("attachments").select("*").eq("event_id", eventId).order("created_at"),
  ]);
  const paths = (files ?? []).map((f: any) => f.file_path);
  const { data: signed } = paths.length ? await sb.storage.from("materials").createSignedUrls(paths, 3600) : { data: [] };
  const urlOf = new Map((signed ?? []).map((s: any) => [s.path, s.signedUrl]));
  const att = (f: any) => ({ id: f.id, file_path: f.file_path, file_name: f.file_name, mime_type: f.mime_type, caption: f.caption, url: urlOf.get(f.file_path) ?? null });

  const rows: FeedbackRow[] = (fb ?? []).map((r: any) => ({
    id: r.id, type: r.type, department_code: r.department_code, category: r.category, text: r.text, rating: r.rating,
    severity: r.severity, resolved: r.resolved, author_name: r.profiles?.full_name ?? null, author_id: r.author, created_at: r.created_at,
    attachments: (files ?? []).filter((f: any) => f.feedback_id === r.id).map(att),
  }));
  const unlinked = (files ?? []).filter((f: any) => !f.feedback_id).map(att);

  return (
    <Feedback eventId={eventId} rows={rows} departments={deptNames} myDept={profile.department_code} myId={userId}
      isAdmin={profile.role === "admin"} editHours={editHours} unlinked={unlinked} />
  );
}

async function LogTab({ eventId, sb, deptNames, acks }: any) {
  const [{ data: revs }, { data: mails }] = await Promise.all([
    sb.from("revisions").select("rev_no, change_summary, changed_at, profiles(full_name)").eq("event_id", eventId).order("rev_no", { ascending: false }),
    sb.from("email_log").select("*").eq("event_id", eventId).order("created_at", { ascending: false }).limit(50),
  ]);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="panel">
        <h2 className="section-title border-b border-line px-4 py-3">Revisions</h2>
        {!revs?.length && <p className="px-4 py-4 text-sm text-muted">Not submitted yet.</p>}
        <ol className="divide-y divide-line">
          {(revs ?? []).map((r: any) => {
            const a = acks.filter((x: any) => x.rev_no === r.rev_no);
            return (
              <li key={r.rev_no} className="px-4 py-3 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">Rev {r.rev_no}</span>
                  <span className="text-xs text-muted">{r.profiles?.full_name}, {fmtDateTime(r.changed_at)}</span>
                </div>
                {r.change_summary?.length ? (
                  <ul className="mt-1 list-disc pl-5 text-muted">{r.change_summary.map((c: string) => <li key={c}>{c}</li>)}</ul>
                ) : <p className="mt-1 text-muted">First submission.</p>}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <Link href={`/sheets/${eventId}/print?rev=${r.rev_no}`} className="font-medium text-corniche hover:underline">Print Rev {r.rev_no}</Link>
                  <span className="text-muted">Acknowledged by: {a.length ? a.map((x: any) => deptNames[x.department_code] ?? x.department_code).join(", ") : "none"}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
      <section className="panel">
        <h2 className="section-title border-b border-line px-4 py-3">Emails sent</h2>
        {!mails?.length && <p className="px-4 py-4 text-sm text-muted">No emails yet.</p>}
        <ul className="divide-y divide-line">
          {(mails ?? []).map((m: any) => (
            <li key={m.id} className="px-4 py-2.5 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{m.subject}</span>
                <span className={`text-xs ${m.status === "failed" ? "text-st-cancelled" : "text-muted"}`}>{m.status}</span>
              </div>
              <p className="text-xs text-muted">{fmtDateTime(m.created_at)}, to {m.recipients.length} recipient{m.recipients.length === 1 ? "" : "s"}{m.error ? `. ${m.error.slice(0, 140)}` : ""}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
