import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { SheetDocument } from "@/components/SheetDocument";
import { PrintButton } from "@/components/PrintButton";
import { requireUser, getDepartments, getSettings, loadSnapshot } from "@/lib/data";
import { fmtDateTime } from "@/lib/time";
import type { SheetSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Print view. ?rev=N prints an old revision exactly as it was sent. */
export default async function PrintPage({ params, searchParams }: { params: { id: string }; searchParams: { rev?: string } }) {
  const { sb } = await requireUser();
  let snap: SheetSnapshot | null;
  if (searchParams.rev) {
    const { data } = await sb.from("revisions").select("snapshot").eq("event_id", params.id).eq("rev_no", Number(searchParams.rev)).single();
    snap = (data?.snapshot as SheetSnapshot) ?? null;
  } else {
    snap = await loadSnapshot(sb, params.id);
  }
  if (!snap) notFound();
  const [settings, departments] = await Promise.all([getSettings(sb), getDepartments(sb)]);
  const qrSvg = await QRCode.toString(`${process.env.APP_BASE_URL ?? ""}/sheets/${params.id}`, { type: "svg", margin: 0 });

  return (
    <div className="min-h-screen bg-paper py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[800px] items-center justify-between px-2">
        <a href={`/sheets/${params.id}`} className="text-sm text-corniche hover:underline">Back to the sheet</a>
        <PrintButton />
      </div>
      <SheetDocument
        s={snap}
        hotelName={settings.hotel.name}
        departments={departments}
        qrSvg={qrSvg}
        printedAt={fmtDateTime(new Date())}
        footer={settings.hotel.footer}
      />
    </div>
  );
}
