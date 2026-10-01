import { Shell } from "@/components/Shell";
import { FollowUp, type TaskRow } from "@/components/FollowUp";
import { requireUser, getDepartments } from "@/lib/data";
import { hotelToday } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Department staff's daily list: open tasks for the next 7 days plus anything overdue. Phone-friendly. */
export default async function MyTasksPage({ searchParams }: { searchParams: { dept?: string; all?: string } }) {
  const { sb, profile } = await requireUser();
  const departments = await getDepartments(sb);
  const isSales = ["admin", "sales"].includes(profile.role);
  const dept = searchParams.dept ?? profile.department_code ?? (isSales ? "" : "none");
  const until = hotelToday(7);

  let q = sb
    .from("event_tasks")
    .select("*, event_days(event_date), events!inner(booking_name, status), task_updates(new_status, comment, eta, created_at, profiles(full_name))")
    .in("events.status", ["submitted", "confirmed"])
    .lte("ready_by", `${until}T23:59:59+03:00`)
    .order("ready_by");
  if (dept) q = q.eq("department_code", dept);
  if (!searchParams.all) q = q.not("status", "in", "(done,na,cancelled)");
  const { data } = await q;

  const rows: TaskRow[] = (data ?? []).map((t: any) => ({
    id: t.id, event_id: t.event_id, department_code: t.department_code,
    title: `${t.title}`, detail: `${t.events.booking_name}${t.detail ? `. ${t.detail}` : ""}`,
    ready_by: t.ready_by, status: t.status, eta: t.eta, status_comment: t.status_comment, changed_in_rev: t.changed_in_rev,
    event_date: t.event_days?.event_date ?? null,
    updates: [...(t.task_updates ?? [])].sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))
      .map((u: any) => ({ new_status: u.new_status, comment: u.comment, eta: u.eta, created_at: u.created_at, user: u.profiles?.full_name ?? null })),
  }));
  rows.sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? ""));
  const names = Object.fromEntries(departments.map((d) => [d.code, d.name]));

  return (
    <Shell active="/tasks">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{dept ? `${names[dept] ?? dept} tasks` : "All open tasks"}</h1>
          <p className="text-sm text-muted">Open tasks for the next 7 days, including anything overdue.</p>
        </div>
        <form className="flex flex-wrap items-center gap-2 text-sm">
          {isSales && (
            <select name="dept" defaultValue={dept} className="field w-auto">
              <option value="">All departments</option>
              {departments.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
            </select>
          )}
          <label className="flex items-center gap-1.5"><input type="checkbox" name="all" value="1" defaultChecked={!!searchParams.all} /> Include finished</label>
          <button className="btn-ghost">Show</button>
        </form>
      </div>
      {!profile.department_code && !isSales ? (
        <p className="panel p-6 text-sm">Your account has no department yet. Ask the admin to set it in Settings.</p>
      ) : (
        <FollowUp tasks={rows} departments={names} showEvent
          editableDepts={isSales ? "all" : profile.department_code ? [profile.department_code] : []} />
      )}
    </Shell>
  );
}
