import { Shell } from "@/components/Shell";
import { SheetForm } from "@/components/SheetForm";
import { requireSales, getDepartments, getSettings, loadSnapshot } from "@/lib/data";
import { fmtDate } from "@/lib/time";
import type { SheetInput, Venue } from "@/lib/types";

export const dynamic = "force-dynamic";

const blank: SheetInput = {
  account_name: "", booking_name: "", contact_name: "", contact_phone: "", contact_email: "",
  event_type: "Meeting", description: "", rate: 0, pricing_unit: "per_day", pricing_pax: 0, pricing_days: 1,
  deposit: 0, payment_method: "", accounts_notes: "", days: [], departments: [],
};

/** New sheet. With ?from=<id> the sheet is duplicated (dates cleared) and last event's remarks are shown. */
export default async function NewSheetPage({ searchParams }: { searchParams: { from?: string } }) {
  const { sb } = await requireSales();
  const [settings, departments, { data: venues }, { data: styles }] = await Promise.all([
    getSettings(sb),
    getDepartments(sb),
    sb.from("venues").select("*").eq("active", true).order("name"),
    sb.from("setup_styles").select("name").eq("active", true).order("name"),
  ]);

  let initial = blank;
  let lastTime: { text: string; type: string; date: string }[] | undefined;
  if (searchParams.from) {
    const src = await loadSnapshot(sb, searchParams.from);
    if (src) {
      initial = {
        ...src,
        id: undefined,
        deposit: 0,
        days: src.days.map(({ id: _id, venue_name: _v, ...d }) => ({ ...d, event_date: "" })),
      };
      const { data: fb } = await sb
        .from("event_feedback")
        .select("text, type, created_at")
        .eq("event_id", searchParams.from)
        .order("created_at", { ascending: false })
        .limit(6);
      lastTime = (fb ?? []).map((f) => ({ text: f.text, type: f.type, date: fmtDate(f.created_at) }));
    }
  }

  return (
    <Shell active="/sheets/new">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{searchParams.from ? "Duplicate function sheet" : "New function sheet"}</h1>
      <p className="mb-5 text-sm text-muted">{searchParams.from ? "Copied from a previous event. Set the new dates, check the details and submit." : "Fill in the event, then submit it to the departments."}</p>
      <SheetForm
        initial={initial}
        status="draft"
        venues={(venues ?? []) as Venue[]}
        setupStyles={(styles ?? []).map((s) => s.name)}
        departments={departments}
        vatRate={settings.vat_rate}
        lastTime={lastTime}
      />
    </Shell>
  );
}
