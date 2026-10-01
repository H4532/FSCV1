import Link from "next/link";
import { Shell } from "@/components/Shell";
import { ReadinessBar, SheetChip } from "@/components/Status";
import { requireUser, getDepartments } from "@/lib/data";
import { fmtDate, fmtTime, hotelToday } from "@/lib/time";
import type { TaskStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { sb, profile } = await requireUser();
  const today = hotelToday();
  const tomorrow = hotelToday(1);
  const depts = await getDepartments(sb);
  const deptName = new Map(depts.map((d) => [d.code, d.name]));

  const { data: days } = await sb
    .from("event_days")
    .select("id, event_date, start_time, end_time, venue_name, pax_guaranteed, setup_style, events!inner(id, sheet_no, booking_name, status, revision)")
    .in("event_date", [today, tomorrow])
    .in("events.status", ["submitted", "confirmed"])
    .order("event_date")
    .order("start_time");

  const eventIds = Array.from(new Set((days ?? []).map((d: any) => d.events.id)));
  const { data: tasks } = eventIds.length
    ? await sb.from("event_tasks").select("event_id, event_day_id, department_code, status, ready_by").in("event_id", eventIds)
    : { data: [] as any[] };

  const { data: drafts } = ["admin", "sales"].includes(profile.role)
    ? await sb.from("events").select("id, sheet_no, booking_name, updated_at, event_days(event_date)").eq("status", "draft").order("updated_at", { ascending: false }).limit(8)
    : { data: [] as any[] };

  const now = Date.now();
  const groups = [
    { date: today, label: "Today" },
    { date: tomorrow, label: "Tomorrow" },
  ];

  return (
    <Shell active="/">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Event readiness</h1>
          <p className="text-sm text-muted">Live status of every department for today&apos;s and tomorrow&apos;s functions.</p>
        </div>
        {["admin", "sales"].includes(profile.role) && <Link href="/sheets/new" className="btn-primary">New function sheet</Link>}
      </div>

      {groups.map((g) => {
        const list = (days ?? []).filter((d: any) => d.event_date === g.date);
        return (
          <section key={g.date} className="mb-8">
            <h2 className="mb-3 flex items-baseline gap-3 text-lg font-semibold">
              {g.label} <span className="text-sm font-normal text-muted">{fmtDate(g.date)}</span>
            </h2>
            {!list.length && <p className="panel px-4 py-6 text-sm text-muted">No functions scheduled.</p>}
            <div className="grid gap-3 md:grid-cols-2">
              {list.map((d: any) => {
                const t = (tasks ?? []).filter((x: any) => x.event_id === d.events.id && (x.event_day_id === d.id || !x.event_day_id));
                const byDept = new Map<string, any[]>();
                t.forEach((x: any) => byDept.set(x.department_code, [...(byDept.get(x.department_code) ?? []), x]));
                const overdue = (arr: any[]) =>
                  arr.filter((x) => !["done", "na", "cancelled"].includes(x.status) && x.ready_by && new Date(x.ready_by).getTime() < now).length;
                return (
                  <Link key={d.id} href={`/sheets/${d.events.id}?tab=followup`} className="panel block p-4 transition hover:border-corniche">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold leading-snug">{d.events.booking_name}</p>
                        <p className="text-sm text-muted">
                          {fmtTime(d.start_time)}-{fmtTime(d.end_time)}, {d.venue_name}, {d.pax_guaranteed} pax{d.setup_style ? `, ${d.setup_style}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <SheetChip status={d.events.status} />
                        <p className="mt-1 text-xs text-muted">{d.events.sheet_no} Rev {d.events.revision}</p>
                      </div>
                    </div>
                    <div className="mt-3 mb-3">
                      <ReadinessBar statuses={t.map((x: any) => x.status as TaskStatus)} overdue={overdue(t)} />
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {Array.from(byDept.entries()).map(([code, arr]) => {
                          const od = overdue(arr);
                          const issues = arr.filter((x) => x.status === "issue").length;
                          const counted = arr.filter((x) => !["na", "cancelled"].includes(x.status));
                          const doneN = counted.filter((x) => x.status === "done").length;
                          return (
                            <tr key={code}>
                              <td className="py-0.5 pr-2">{deptName.get(code) ?? code}</td>
                              <td className="w-28 py-0.5 pr-2"><ReadinessBar statuses={arr.map((x) => x.status)} overdue={od} /></td>
                              <td className="w-24 py-0.5 text-right text-xs">
                                {od > 0 && <span className="font-semibold text-st-cancelled">{od} overdue</span>}
                                {!od && issues > 0 && <span className="font-semibold text-st-issue">{issues} issue</span>}
                                {!od && !issues && <span className="text-muted">{doneN}/{counted.length}</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

      {!!drafts?.length && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Your drafts</h2>
          <div className="panel divide-y divide-line">
            {drafts.map((d: any) => (
              <Link key={d.id} href={`/sheets/${d.id}/edit`} className="flex justify-between px-4 py-2.5 text-sm hover:bg-paper">
                <span>{d.booking_name}</span>
                <span className="text-muted">{d.sheet_no}{d.event_days?.[0] ? `, ${fmtDate(d.event_days[0].event_date)}` : ""}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </Shell>
  );
}
