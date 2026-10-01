import type { SheetSnapshot } from "./types";
import { localToIso, minusMinutes, fmtDate, fmtTime } from "./time";

export interface DesiredTask {
  task_key: string;
  content_hash: string;
  department_code: string;
  event_date: string | null;
  title: string;
  detail: string | null;
  ready_by: string | null;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const NO_KITCHEN = /^(water|soft drinks?|juices?|mineral water)$/i;

/** Cheap stable hash (djb2) - only used to detect requirement changes. */
function hash(obj: unknown) {
  const s = JSON.stringify(obj);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Turns a function sheet into department tasks.
 * Task keys are stable, so on a revision only tasks whose content changed are reset to Pending.
 */
export function buildTasks(s: SheetSnapshot, leadMinutes: number): DesiredTask[] {
  const out: DesiredTask[] = [];
  const days = [...s.days].sort((a, b) => a.event_date.localeCompare(b.event_date));

  for (const d of days) {
    const start = localToIso(d.event_date, d.start_time);
    const label = fmtDate(d.event_date);

    // Banquet: room setup
    const setup = { v: d.venue_name, s: d.setup_style, p: d.pax_guaranteed, e: d.pax_expected, t: d.start_time, n: d.notes };
    out.push({
      task_key: `${d.event_date}:banquet:setup`,
      content_hash: hash(setup),
      department_code: "banquet",
      event_date: d.event_date,
      title: `Set up ${d.venue_name}${d.setup_style ? `, ${d.setup_style}` : ""} for ${d.pax_guaranteed} pax`,
      detail: [`${label}, program ${fmtTime(d.start_time)}-${fmtTime(d.end_time)}`, d.notes].filter(Boolean).join(". "),
      ready_by: minusMinutes(start, leadMinutes),
    });

    // F&B service + kitchen preparation per item
    for (const f of d.fnb) {
      if (!f.item.trim()) continue;
      const time = f.serve_time || d.start_time;
      const serveAt = localToIso(d.event_date, time);
      const pax = f.pax ?? d.pax_guaranteed;
      const h = hash({ i: f.item, m: f.menu_ref, p: pax, t: time, n: f.notes });
      const base = `${d.event_date}:${slug(f.item)}:${fmtTime(f.serve_time) || "start"}`;
      out.push({
        task_key: `fnb:${base}`,
        content_hash: h,
        department_code: "fnb",
        event_date: d.event_date,
        title: `Serve ${f.item} for ${pax} pax at ${fmtTime(time)}`,
        detail: [label, d.venue_name, f.menu_ref && `Menu: ${f.menu_ref}`, f.notes].filter(Boolean).join(". "),
        ready_by: serveAt,
      });
      if (!NO_KITCHEN.test(f.item.trim())) {
        out.push({
          task_key: `kitchen:${base}`,
          content_hash: h,
          department_code: "kitchen",
          event_date: d.event_date,
          title: `Prepare ${f.item}${f.menu_ref ? ` (${f.menu_ref})` : ""} for ${pax} pax`,
          detail: [label, `Service at ${fmtTime(time)}`, f.notes].filter(Boolean).join(". "),
          ready_by: minusMinutes(serveAt, 15),
        });
      }
    }

    // Department requirements written on the sheet (one task per event day)
    for (const n of s.departments) {
      if (n.not_required || !n.notes?.trim() || ["accounts", "sales"].includes(n.department_code)) continue;
      const readyBy = n.ready_by ? localToIso(d.event_date, n.ready_by) : minusMinutes(start, leadMinutes);
      out.push({
        task_key: `${d.event_date}:dept:${n.department_code}`,
        content_hash: hash({ n: n.notes, r: n.ready_by, v: d.venue_name, t: d.start_time }),
        department_code: n.department_code,
        event_date: d.event_date,
        title: n.notes.split("\n")[0].slice(0, 120),
        detail: `${label}, ${d.venue_name}. ${n.notes}`,
        ready_by: readyBy,
      });
    }
  }

  // Accounts: payment verification before the first day
  const acc = s.departments.find((n) => n.department_code === "accounts");
  if (days.length && s.total > 0 && !acc?.not_required) {
    const first = days[0];
    const balance = Math.round((s.total - s.deposit) * 100) / 100;
    out.push({
      task_key: "accounts:payment",
      content_hash: hash({ t: s.total, d: s.deposit, m: s.payment_method }),
      department_code: "accounts",
      event_date: first.event_date,
      title: balance > 0 ? `Collect balance SR ${balance} (total SR ${s.total})` : `Verify payment received SR ${s.deposit}`,
      detail: [s.payment_method && `Method: ${s.payment_method}`, acc?.notes].filter(Boolean).join(". ") || null,
      ready_by: localToIso(first.event_date, first.start_time),
    });
  }
  return out;
}

/** Departments that have something to do on this sheet (used for "by_content" email routing). */
export function involvedDepartments(s: SheetSnapshot, tasks: DesiredTask[]) {
  const set = new Set<string>(["sales"]);
  tasks.forEach((t) => set.add(t.department_code));
  s.departments.forEach((n) => { if (!n.not_required && n.notes?.trim()) set.add(n.department_code); });
  return set;
}
