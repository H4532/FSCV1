import type { SupabaseClient } from "@supabase/supabase-js";

export interface HistoryFilters {
  q?: string; from?: string; to?: string; status?: string; venue?: string; sales?: string;
  payment?: string; flag?: string; account?: string; page?: string;
}

/** Shared by the History page and the CSV export so both always show the same rows. */
export async function queryHistory(sb: SupabaseClient, f: HistoryFilters, limit: number) {
  let q = sb
    .from("events")
    .select(
      "id, sheet_no, account_id, account_name, booking_name, contact_name, status, revision, total, deposit, created_at, sales:profiles!events_sales_user_id_fkey(full_name), event_days!inner(event_date, venue_id, venue_name, pax_guaranteed), event_feedback(type, rating, resolved), attachments(id)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (f.q) q = q.or(`booking_name.ilike.%${f.q}%,account_name.ilike.%${f.q}%,contact_name.ilike.%${f.q}%,sheet_no.ilike.%${f.q}%`);
  if (f.from) q = q.gte("event_days.event_date", f.from);
  if (f.to) q = q.lte("event_days.event_date", f.to);
  if (f.status) q = q.eq("status", f.status);
  if (f.venue) q = q.eq("event_days.venue_id", f.venue);
  if (f.sales) q = q.eq("sales_user_id", f.sales);
  if (f.account) q = q.eq("account_id", f.account);

  const page = Math.max(1, Number(f.page ?? 1));
  q = q.range((page - 1) * limit, page * limit - 1);
  const { data, count } = await q;

  let rows = (data ?? []).map((e: any) => {
    const days = [...e.event_days].sort((a: any, b: any) => a.event_date.localeCompare(b.event_date));
    const fb = e.event_feedback ?? [];
    const ratings = fb.filter((x: any) => x.rating).map((x: any) => x.rating);
    return {
      id: e.id, sheet_no: e.sheet_no, account_id: e.account_id, account_name: e.account_name, booking_name: e.booking_name,
      status: e.status, revision: e.revision, total: Number(e.total), deposit: Number(e.deposit),
      balance: Math.round((Number(e.total) - Number(e.deposit)) * 100) / 100,
      sales: e.sales?.full_name ?? "",
      first: days[0]?.event_date ?? "", last: days[days.length - 1]?.event_date ?? "",
      venues: Array.from(new Set(days.map((d: any) => d.venue_name))).join(", "),
      pax: Math.max(0, ...days.map((d: any) => d.pax_guaranteed)),
      rating: ratings.length ? Math.round((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length) * 10) / 10 : null,
      openIncidents: fb.filter((x: any) => x.type === "incident" && !x.resolved).length,
      files: e.attachments?.length ?? 0,
    };
  });
  if (f.payment === "due") rows = rows.filter((r) => r.balance > 0 && r.status !== "cancelled");
  if (f.payment === "paid") rows = rows.filter((r) => r.balance <= 0);
  if (f.flag === "incidents") rows = rows.filter((r) => r.openIncidents > 0);
  if (f.flag === "lowrating") rows = rows.filter((r) => r.rating !== null && r.rating < 3);
  return { rows, count: count ?? 0, page };
}
