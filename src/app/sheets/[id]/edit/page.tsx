import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { SheetForm } from "@/components/SheetForm";
import { requireSales, getDepartments, getSettings, loadSnapshot } from "@/lib/data";
import type { Venue } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditSheetPage({ params }: { params: { id: string } }) {
  const { sb } = await requireSales();
  const snap = await loadSnapshot(sb, params.id);
  if (!snap) notFound();
  const [settings, departments, { data: venues }, { data: styles }] = await Promise.all([
    getSettings(sb),
    getDepartments(sb),
    sb.from("venues").select("*").eq("active", true).order("name"),
    sb.from("setup_styles").select("name").eq("active", true).order("name"),
  ]);
  const locked = ["completed", "cancelled"].includes(snap.status);

  return (
    <Shell>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Edit {snap.sheet_no}</h1>
      <p className="mb-5 text-sm text-muted">
        {snap.status === "draft" ? "Draft, not yet sent to departments." : `Currently Rev ${snap.revision}. Changes are highlighted to departments and affected tasks reset to Pending.`}
      </p>
      {locked ? (
        <p className="panel p-4 text-sm">This sheet is {snap.status} and locked. An admin can reopen it from the sheet page.</p>
      ) : (
        <SheetForm
          initial={{ ...snap, days: snap.days.map(({ id: _i, venue_name: _v, ...d }) => d) }}
          status={snap.status}
          venues={(venues ?? []) as Venue[]}
          setupStyles={(styles ?? []).map((s) => s.name)}
          departments={departments}
          vatRate={settings.vat_rate}
        />
      )}
    </Shell>
  );
}
