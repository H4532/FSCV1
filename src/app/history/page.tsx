import Link from "next/link";
import { Shell } from "@/components/Shell";
import { SheetChip } from "@/components/Status";
import { requireUser } from "@/lib/data";
import { fmtDate } from "@/lib/time";
import { fmt } from "@/lib/calc";
import { queryHistory, type HistoryFilters } from "./query";

export const dynamic = "force-dynamic";
const PAGE = 30;

export default async function HistoryPage({ searchParams }: { searchParams: HistoryFilters }) {
  const { sb } = await requireUser();
  const [{ rows, count, page }, { data: venues }, { data: sales }] = await Promise.all([
    queryHistory(sb, searchParams, PAGE),
    sb.from("venues").select("id, name").order("name"),
    sb.from("profiles").select("id, full_name").in("role", ["sales", "admin"]).order("full_name"),
  ]);
  const qs = new URLSearchParams(Object.entries(searchParams).filter(([k, v]) => v && k !== "page") as [string, string][]).toString();

  // Account summary when filtered to one client
  const account = searchParams.account && rows[0] ? rows[0].account_name : null;
  const live = rows.filter((r) => r.status !== "cancelled");
  const revenue = live.reduce((a, r) => a + r.total, 0);
  const avgPax = live.length ? Math.round(live.reduce((a, r) => a + r.pax, 0) / live.length) : 0;

  return (
    <Shell active="/history">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{account ?? "History"}</h1>
          <p className="text-sm text-muted">{count} function sheet{count === 1 ? "" : "s"}{account ? " for this account" : ""}. Sheets are never deleted; cancelled events stay with their reason.</p>
        </div>
        <a href={`/history/export?${qs}`} className="btn-ghost">Export to Excel (CSV)</a>
      </div>

      {account && (
        <div className="mb-4 flex flex-wrap gap-x-8 gap-y-1 rounded bg-corniche-soft px-4 py-3 text-sm">
          <span>Events <strong>{live.length}</strong></span>
          <span>Revenue <strong>SR {fmt(revenue)}</strong></span>
          <span>Average pax <strong>{avgPax}</strong></span>
          <Link href="/history" className="ml-auto text-corniche hover:underline">Clear account filter</Link>
        </div>
      )}

      <form className="panel mb-4 grid gap-3 p-4 md:grid-cols-4 lg:grid-cols-8">
        <input type="hidden" name="account" defaultValue={searchParams.account} />
        <div className="md:col-span-2">
          <label className="label" htmlFor="q">Search</label>
          <input id="q" name="q" className="field" placeholder="Client, contact or FS number" defaultValue={searchParams.q} />
        </div>
        <div><label className="label" htmlFor="from">Event from</label><input id="from" type="date" name="from" className="field" defaultValue={searchParams.from} /></div>
        <div><label className="label" htmlFor="to">Event to</label><input id="to" type="date" name="to" className="field" defaultValue={searchParams.to} /></div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="field" defaultValue={searchParams.status}>
            <option value="">Any</option><option value="draft">Draft</option><option value="submitted">Submitted</option>
            <option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="venue">Venue</label>
          <select id="venue" name="venue" className="field" defaultValue={searchParams.venue}>
            <option value="">Any</option>{(venues ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sales">Sales</label>
          <select id="sales" name="sales" className="field" defaultValue={searchParams.sales}>
            <option value="">Anyone</option>{(sales ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="payment">Payment</label>
          <select id="payment" name="payment" className="field" defaultValue={searchParams.payment}>
            <option value="">Any</option><option value="due">Balance due</option><option value="paid">Fully paid</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="flag">Feedback</label>
          <select id="flag" name="flag" className="field" defaultValue={searchParams.flag}>
            <option value="">Any</option><option value="incidents">Open incidents</option><option value="lowrating">Rating below 3</option>
          </select>
        </div>
        <div className="flex items-end gap-2 md:col-span-2">
          <button className="btn-primary">Filter</button>
          <Link href="/history" className="btn-ghost">Reset</Link>
        </div>
      </form>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="bg-paper">
            <tr>
              <th className="th">Sheet</th><th className="th">Client</th><th className="th">Dates</th><th className="th">Venue</th>
              <th className="th text-right">Pax</th><th className="th">Status</th><th className="th text-right">Total SR</th>
              <th className="th">Sales</th><th className="th">Feedback</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td colSpan={9} className="td py-8 text-center text-muted">No sheets match these filters.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-paper">
                <td className="td whitespace-nowrap">
                  <Link href={r.status === "draft" ? `/sheets/${r.id}/edit` : `/sheets/${r.id}`} className="font-medium text-corniche hover:underline">{r.sheet_no}</Link>
                  <span className="block text-xs text-muted">Rev {r.revision}</span>
                </td>
                <td className="td">
                  <span className="font-medium">{r.booking_name}</span>
                  {r.account_id && <Link href={`/history?account=${r.account_id}`} className="block text-xs text-muted hover:text-corniche">All events for this account</Link>}
                </td>
                <td className="td whitespace-nowrap">{fmtDate(r.first)}{r.last !== r.first ? <span className="block text-xs text-muted">to {fmtDate(r.last)}</span> : null}</td>
                <td className="td">{r.venues}</td>
                <td className="td text-right">{r.pax}</td>
                <td className="td"><SheetChip status={r.status} /></td>
                <td className="td whitespace-nowrap text-right">
                  {fmt(r.total)}
                  {r.balance > 0 && r.status !== "cancelled" && <span className="block text-xs text-st-issue">due {fmt(r.balance)}</span>}
                </td>
                <td className="td">{r.sales}</td>
                <td className="td whitespace-nowrap text-xs">
                  <Link href={`/sheets/${r.id}?tab=feedback`} className="hover:underline">
                    {r.rating !== null && <span className={r.rating < 3 ? "font-semibold text-st-cancelled" : "text-st-progress"}>{r.rating}/5 </span>}
                    {r.openIncidents > 0 && <span className="font-semibold text-st-issue">⚠ {r.openIncidents} </span>}
                    {r.files > 0 && <span className="text-muted">📎 {r.files}</span>}
                    {r.rating === null && !r.openIncidents && !r.files && <span className="text-muted">-</span>}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {count > PAGE && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">Page {page} of {Math.ceil(count / PAGE)}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="btn-ghost" href={`/history?${qs}&page=${page - 1}`}>Previous</Link>}
            {page * PAGE < count && <Link className="btn-ghost" href={`/history?${qs}&page=${page + 1}`}>Next</Link>}
          </div>
        </div>
      )}
    </Shell>
  );
}
