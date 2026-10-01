import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SheetSnapshot } from "./types";
import { esc, sendMail } from "./mail";
import { fmtDate, fmtTime } from "./time";
import { fmt } from "./calc";

const base = () => process.env.APP_BASE_URL ?? "http://localhost:3000";

export async function recipientsFor(sb: SupabaseClient, departments: string[] | "all") {
  let q = sb.from("recipients").select("email, department_code").eq("active", true);
  if (departments !== "all") q = q.in("department_code", departments);
  const { data } = await q;
  return (data ?? []).map((r) => r.email as string);
}

export function sheetEmailHtml(s: SheetSnapshot, eventId: string, hotelName: string, changes: string[]) {
  const url = `${base()}/sheets/${eventId}`;
  const rows = s.days
    .map(
      (d) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #D6DCCF">${esc(fmtDate(d.event_date))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #D6DCCF">${esc(fmtTime(d.start_time))}-${esc(fmtTime(d.end_time))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #D6DCCF">${esc(d.venue_name)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #D6DCCF">${d.pax_guaranteed} pax${d.setup_style ? `, ${esc(d.setup_style)}` : ""}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #D6DCCF">${d.fnb.map((f) => `${esc(fmtTime(f.serve_time))} ${esc(f.item)}`).join("<br>")}</td>
      </tr>`
    )
    .join("");
  const changeBlock = changes.length
    ? `<div style="background:#FFF4E5;border-left:4px solid #D9822B;padding:10px 14px;margin:14px 0">
         <strong>Changed in revision ${s.revision}:</strong><ul style="margin:6px 0 0 18px;padding:0">${changes
           .map((c) => `<li>${esc(c)}</li>`)
           .join("")}</ul></div>`
    : "";
  return `<div style="font-family:Segoe UI,Arial,sans-serif;color:#1E2619;max-width:760px">
    <div style="background:#3E5B2A;color:#fff;padding:14px 18px;font-size:16px"><strong>${esc(hotelName)}</strong> - Function sheet ${esc(s.sheet_no)} (Rev ${s.revision})</div>
    <div style="padding:14px 18px;border:1px solid #D6DCCF;border-top:0">
      <p style="margin:0 0 4px;font-size:18px"><strong>${esc(s.booking_name)}</strong></p>
      <p style="margin:0 0 10px;color:#5F6B57">${esc(s.event_type)}${s.description ? ` - ${esc(s.description)}` : ""}. Sales: ${esc(s.sales_name ?? "")}</p>
      ${changeBlock}
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <tr style="background:#E6ECDF;text-align:left"><th style="padding:6px 10px">Date</th><th style="padding:6px 10px">Time</th><th style="padding:6px 10px">Venue</th><th style="padding:6px 10px">Pax / setup</th><th style="padding:6px 10px">F&amp;B</th></tr>
        ${rows}
      </table>
      <p style="margin:14px 0 4px;font-size:13px">Total SR ${fmt(s.total)} (incl. VAT), received SR ${fmt(s.deposit)}</p>
      <p style="margin:18px 0"><a href="${url}" style="background:#3E5B2A;color:#fff;padding:10px 16px;text-decoration:none;border-radius:4px">Open function sheet and confirm your tasks</a></p>
      <p style="font-size:12px;color:#5F6B57">Please acknowledge the sheet and update your department's tasks in the system. A printable version is available from the sheet page.</p>
    </div></div>`;
}

export async function logMail(
  sb: SupabaseClient,
  row: { event_id: string | null; rev_no?: number; kind: string; recipients: string[]; subject: string },
  send: () => Promise<"sent" | "logged">
) {
  try {
    const status = await send();
    await sb.from("email_log").insert({ ...row, status });
  } catch (e) {
    await sb.from("email_log").insert({ ...row, status: "failed", error: String(e) });
  }
}

export { sendMail };
