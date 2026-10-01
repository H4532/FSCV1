import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { queryHistory } from "../query";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const f = Object.fromEntries(req.nextUrl.searchParams.entries());
  const { rows } = await queryHistory(sb, { ...f, page: "1" }, 5000);
  const head = ["Sheet", "Rev", "Booking", "Account", "First date", "Last date", "Venues", "Pax", "Status", "Total SR", "Received SR", "Balance SR", "Sales", "Rating", "Open incidents"];
  const lines = rows.map((r) =>
    [r.sheet_no, r.revision, r.booking_name, r.account_name, r.first, r.last, r.venues, r.pax, r.status, r.total, r.deposit, r.balance, r.sales, r.rating ?? "", r.openIncidents]
      .map(cell).join(",")
  );
  // BOM so Excel opens Arabic names correctly
  return new Response("\uFEFF" + [head.join(","), ...lines].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="function-sheets-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
