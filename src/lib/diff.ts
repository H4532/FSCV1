import type { SheetSnapshot } from "./types";
import { fmtDate, fmtTime } from "./time";

/** Human-readable list of what changed between two revisions, e.g. "Oct 2: pax 35 -> 40". */
export function diffSnapshots(prev: SheetSnapshot | null, next: SheetSnapshot): string[] {
  if (!prev) return [];
  const out: string[] = [];
  const cmp = (label: string, a: unknown, b: unknown) => {
    const av = a ?? "", bv = b ?? "";
    if (String(av) !== String(bv)) out.push(`${label}: ${av || "(empty)"} -> ${bv || "(empty)"}`);
  };

  cmp("Account", prev.account_name, next.account_name);
  cmp("Booking name", prev.booking_name, next.booking_name);
  cmp("Contact", prev.contact_name, next.contact_name);
  cmp("Contact phone", prev.contact_phone, next.contact_phone);
  cmp("Event type", prev.event_type, next.event_type);
  cmp("Description", prev.description, next.description);
  cmp("Total (SR)", prev.total, next.total);
  cmp("Received (SR)", prev.deposit, next.deposit);

  const byDate = (s: SheetSnapshot) => new Map(s.days.map((d) => [d.event_date, d]));
  const pd = byDate(prev), nd = byDate(next);
  for (const [date, d] of nd) {
    const p = pd.get(date);
    const L = fmtDate(date);
    if (!p) { out.push(`${L}: day added (${d.venue_name}, ${d.pax_guaranteed} pax)`); continue; }
    cmp(`${L} venue`, p.venue_name, d.venue_name);
    cmp(`${L} time`, `${fmtTime(p.start_time)}-${fmtTime(p.end_time)}`, `${fmtTime(d.start_time)}-${fmtTime(d.end_time)}`);
    cmp(`${L} pax`, p.pax_guaranteed, d.pax_guaranteed);
    cmp(`${L} setup`, p.setup_style, d.setup_style);
    cmp(`${L} notes`, p.notes, d.notes);
    const f = (x: typeof d) => x.fnb.map((i) => `${fmtTime(i.serve_time)} ${i.item}${i.menu_ref ? ` (${i.menu_ref})` : ""}${i.pax ? ` x${i.pax}` : ""}`).join(", ");
    cmp(`${L} F&B`, f(p), f(d));
  }
  for (const [date] of pd) if (!nd.has(date)) out.push(`${fmtDate(date)}: day removed`);

  const notes = (s: SheetSnapshot) => new Map(s.departments.map((n) => [n.department_code, n]));
  const pn = notes(prev), nn = notes(next);
  for (const [code, n] of nn) {
    const p = pn.get(code);
    const a = p ? (p.not_required ? "No requirements" : `${p.notes || ""}${p.ready_by ? ` (by ${fmtTime(p.ready_by)})` : ""}`) : "";
    const b = n.not_required ? "No requirements" : `${n.notes || ""}${n.ready_by ? ` (by ${fmtTime(n.ready_by)})` : ""}`;
    if (a !== b) out.push(`${code}: ${a || "(empty)"} -> ${b || "(empty)"}`);
  }
  return out;
}
