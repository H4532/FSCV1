import type { Department, SheetSnapshot } from "@/lib/types";
import { fmtDate, fmtTime } from "@/lib/time";
import { pricingFormula, fmt } from "@/lib/calc";

/** The function sheet itself, laid out like the hotel's paper sheet. Used on screen and for A4 print. */
export function SheetDocument({
  s, hotelName, departments, qrSvg, printedAt, footer,
}: {
  s: SheetSnapshot; hotelName: string; departments: Department[]; qrSvg?: string; printedAt?: string; footer?: string;
}) {
  const note = (code: string) => s.departments.find((d) => d.department_code === code);
  const balance = Math.round((s.total - s.deposit) * 100) / 100;
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <tr>
      <th className="w-36 border-b border-white bg-[#D9D9D9] px-2 py-1 text-left align-top text-[12px] font-semibold">{label}</th>
      <td className="border-b border-line px-3 py-1 text-[12.5px]">{children}</td>
    </tr>
  );
  const Block = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <tr className="border-t-2 border-corniche">
      <th className="w-36 bg-[#D9D9D9] px-2 py-3 text-left align-middle text-[12.5px] font-semibold">{label}</th>
      <td className="px-3 py-3 text-[12.5px] leading-relaxed">{children}</td>
    </tr>
  );
  const deptText = (code: string) => {
    const n = note(code);
    if (!n) return <span className="text-muted">-</span>;
    if (n.not_required) return <span className="text-muted">No requirements</span>;
    return (
      <span className="whitespace-pre-wrap">
        {n.notes}
        {n.ready_by && <strong>{` (ready by ${fmtTime(n.ready_by)})`}</strong>}
      </span>
    );
  };
  const extra = departments.filter((d) => !["sales", "banquet", "fnb", "kitchen", "accounts", "housekeeping", "hr", "engineering_it"].includes(d.code));

  return (
    <div className="print-sheet mx-auto max-w-[800px] border-2 border-corniche bg-white text-ink">
      <div className="flex items-center justify-between bg-corniche px-4 py-4 text-white">
        <div className="w-24 text-[11px] leading-tight opacity-90">{s.sheet_no}<br />Rev {s.revision}</div>
        <p className="text-center text-[17px] font-semibold">{hotelName}</p>
        <div className="flex w-24 justify-end">
          {qrSvg ? <div className="h-16 w-16 bg-white p-1" dangerouslySetInnerHTML={{ __html: qrSvg }} /> : <span className="text-[11px] opacity-90">{s.status}</span>}
        </div>
      </div>

      <table className="w-full border-collapse bg-[#F2F2F2]">
        <tbody>
          <Row label="Event description">{s.event_type}{s.description ? `, ${s.description}` : ""}</Row>
          <Row label="Booking name">{s.booking_name}</Row>
          <Row label="Account name">{s.account_name}</Row>
          <Row label="Contact details">{[s.contact_name, s.contact_phone, s.contact_email].filter(Boolean).join(", ") || "-"}</Row>
          <Row label="Sales">{s.sales_name ?? "-"}</Row>
        </tbody>
      </table>

      <p className="bg-corniche px-2 py-1 text-[12.5px] font-semibold text-white">Function specification</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="bg-[#D9D9D9]">
            <tr>
              <th className="px-2 py-1 text-left">Date</th><th className="px-2 py-1 text-left">Program</th>
              <th className="px-2 py-1 text-left">Venue</th><th className="px-2 py-1 text-left">Setup</th>
              <th className="px-2 py-1 text-right">Guaranteed</th><th className="px-2 py-1 text-right">Expected</th>
            </tr>
          </thead>
          <tbody>
            {s.days.map((d) => (
              <tr key={d.event_date} className="border-b border-line">
                <td className="px-2 py-1.5 font-medium">{fmtDate(d.event_date)}</td>
                <td className="px-2 py-1.5">{fmtTime(d.start_time)} - {fmtTime(d.end_time)}</td>
                <td className="px-2 py-1.5 font-semibold text-st-cancelled">{d.venue_name}</td>
                <td className="px-2 py-1.5">{d.setup_style || "-"}{d.notes ? <span className="block text-muted">{d.notes}</span> : null}</td>
                <td className="px-2 py-1.5 text-right">{d.pax_guaranteed}</td>
                <td className="px-2 py-1.5 text-right">{d.pax_expected}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <table className="w-full border-collapse">
        <tbody>
          <Block label="F&B service">
            {s.days.map((d) => (
              <div key={d.event_date} className="mb-1.5">
                <strong>{fmtDate(d.event_date)}</strong>
                {d.fnb.length ? (
                  <ul className="ml-4 list-disc">
                    {d.fnb.map((f, i) => (
                      <li key={i}>
                        {fmtTime(f.serve_time) && <strong>{fmtTime(f.serve_time)} </strong>}
                        {f.item}{f.menu_ref ? ` (${f.menu_ref})` : ""}{f.pax ? `, ${f.pax} pax` : ""}{f.notes ? `. ${f.notes}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : <span className="text-muted"> - none</span>}
              </div>
            ))}
            {note("fnb")?.notes && <p className="mt-1 whitespace-pre-wrap">{note("fnb")!.notes}</p>}
          </Block>
          <Block label="Kitchen">{deptText("kitchen")}</Block>
          <Block label="Banquet">{deptText("banquet")}</Block>
          <Block label="Housekeeping">{deptText("housekeeping")}</Block>
          <Block label="HR">{deptText("hr")}</Block>
          <Block label="Engineering & IT">{deptText("engineering_it")}</Block>
          {extra.map((d) => <Block key={d.code} label={d.name}>{deptText(d.code)}</Block>)}
          <Block label="Accounts">
            <p>{pricingFormula(s.rate, s.pricing_unit, s.pricing_pax, s.pricing_days, s.vat_rate)}</p>
            <p><span className="font-semibold text-st-done">Received</span> <strong>SR {fmt(s.deposit)}</strong>{s.payment_method ? ` (${s.payment_method})` : ""}</p>
            <p className={balance > 0 ? "font-semibold text-st-cancelled" : ""}>{balance > 0 ? `Balance due SR ${fmt(balance)}` : "Fully paid"}</p>
            {deptText("accounts")}
          </Block>
        </tbody>
      </table>
      {(printedAt || footer) && (
        <div className="flex justify-between border-t-2 border-corniche px-3 py-1.5 text-[10.5px] text-muted">
          <span>{footer}</span>
          <span>{printedAt && `Printed ${printedAt}. Rev ${s.revision}. Scan the code for the latest version.`}</span>
        </div>
      )}
    </div>
  );
}
