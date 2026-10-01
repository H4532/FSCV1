"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSheet } from "@/app/actions/sheets";
import { computeTotals, fmt } from "@/lib/calc";
import type { DayInput, Department, SheetInput, Venue } from "@/lib/types";

const AUTO = ["sales", "banquet", "fnb", "kitchen", "accounts"];
const EVENT_TYPES = ["Meeting", "Workshop", "Conference", "Training", "Wedding", "Banquet", "Lunch", "Dinner", "Coffee break", "Exhibition", "Other"];
const FNB_PRESETS = ["Water", "Coffee break", "Lunch", "Dinner", "Breakfast", "Soft drinks", "Working lunch"];

const emptyDay = (prev?: DayInput): DayInput => ({
  event_date: "",
  venue_id: prev?.venue_id ?? "",
  start_time: prev?.start_time ?? "09:00",
  end_time: prev?.end_time ?? "17:00",
  pax_guaranteed: prev?.pax_guaranteed ?? 0,
  pax_expected: prev?.pax_expected ?? 0,
  setup_style: prev?.setup_style ?? "",
  notes: "",
  fnb: prev ? prev.fnb.map((f) => ({ ...f })) : [],
});

interface Props {
  initial: SheetInput;
  status: string;
  venues: Venue[];
  setupStyles: string[];
  departments: Department[];
  vatRate: number;
  lastTime?: { text: string; type: string; date: string }[];
}

export function SheetForm({ initial, status, venues, setupStyles, departments, vatRate, lastTime }: Props) {
  const router = useRouter();
  const [s, setS] = useState<SheetInput>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<{ id: string; list: string[] } | null>(null);
  const [pending, start] = useTransition();
  const isDraft = status === "draft";

  const set = <K extends keyof SheetInput>(k: K, v: SheetInput[K]) => setS((p) => ({ ...p, [k]: v }));
  const setDay = (i: number, patch: Partial<DayInput>) =>
    setS((p) => ({ ...p, days: p.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));

  const totals = useMemo(
    () => computeTotals(s.rate, s.pricing_unit, s.pricing_pax, s.pricing_days, vatRate),
    [s.rate, s.pricing_unit, s.pricing_pax, s.pricing_days, vatRate]
  );
  const balance = Math.round((totals.total - s.deposit) * 100) / 100;

  const notesFor = (code: string) =>
    s.departments.find((d) => d.department_code === code) ?? { department_code: code, notes: "", not_required: false, ready_by: "" };
  const setNote = (code: string, patch: Partial<SheetInput["departments"][number]>) =>
    setS((p) => {
      const exists = p.departments.some((d) => d.department_code === code);
      const list = exists
        ? p.departments.map((d) => (d.department_code === code ? { ...d, ...patch } : d))
        : [...p.departments, { ...notesFor(code), ...patch }];
      return { ...p, departments: list };
    });

  function submit(publish: boolean) {
    setErrors([]);
    // keep pricing days in sync with the number of days unless it's a package
    const payload = { ...s, pricing_days: s.pricing_unit === "package" ? 1 : s.pricing_days };
    start(async () => {
      const res = await saveSheet(payload, publish);
      if (!res.ok) {
        setErrors(res.errors);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (res.warnings.length) setWarnings({ id: res.id, list: res.warnings });
      else router.push(`/sheets/${res.id}`);
    });
  }

  if (warnings)
    return (
      <div className="panel max-w-xl p-5">
        <h2 className="section-title mb-2">Saved, with warnings</h2>
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-st-issue">{warnings.list.map((w) => <li key={w}>{w}</li>)}</ul>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => router.push(`/sheets/${warnings.id}`)}>Open the sheet</button>
          <button className="btn-ghost" onClick={() => { setWarnings(null); setS((p) => ({ ...p, id: warnings.id })); }}>Keep editing</button>
        </div>
      </div>
    );

  return (
    <div className="space-y-5 pb-24">
      {!!errors.length && (
        <div className="rounded-md border border-st-cancelled/40 bg-st-cancelled/5 p-4" role="alert">
          <p className="mb-1 text-sm font-semibold text-st-cancelled">Fix these before saving:</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      {!!lastTime?.length && (
        <div className="rounded-md border border-st-issue/40 bg-st-issue/5 p-4">
          <p className="mb-1 text-sm font-semibold">Last time with this client</p>
          <ul className="space-y-0.5 text-sm">{lastTime.map((l, i) => <li key={i}><span className="text-muted">{l.date}, {l.type}:</span> {l.text}</li>)}</ul>
        </div>
      )}

      {/* Event header */}
      <section className="panel p-4">
        <h2 className="section-title mb-3">Event and client</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="account">Account</label>
            <input id="account" className="field" value={s.account_name} onChange={(e) => set("account_name", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="booking">Booking name</label>
            <input id="booking" className="field" value={s.booking_name}
              onFocus={() => !s.booking_name && s.account_name && set("booking_name", s.account_name)}
              onChange={(e) => set("booking_name", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="type">Event type</label>
            <select id="type" className="field" value={s.event_type} onChange={(e) => set("event_type", e.target.value)}>
              {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="desc">Description</label>
            <input id="desc" className="field" placeholder="e.g. Meeting and lunch" value={s.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="cname">Contact person</label>
            <input id="cname" className="field" value={s.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="cphone">Phone</label>
              <input id="cphone" className="field" value={s.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="cemail">Email</label>
              <input id="cemail" type="email" className="field" value={s.contact_email} onChange={(e) => set("contact_email", e.target.value)} />
            </div>
          </div>
        </div>
      </section>

      {/* Days */}
      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Event days</h2>
          <button type="button" className="btn-ghost" onClick={() => set("days", [...s.days, emptyDay(s.days[s.days.length - 1])])}>Add day</button>
        </div>
        {!s.days.length && <p className="text-sm text-muted">Add the first day of the event.</p>}
        <div className="space-y-4">
          {s.days.map((d, i) => {
            const venue = venues.find((v) => v.id === d.venue_id);
            const over = venue?.capacity && (d.pax_expected || d.pax_guaranteed) > venue.capacity;
            return (
              <div key={i} className="rounded border border-line bg-paper/60 p-3">
                <div className="grid gap-3 md:grid-cols-6">
                  <div className="md:col-span-2">
                    <label className="label">Date</label>
                    <input type="date" className="field" value={d.event_date} onChange={(e) => setDay(i, { event_date: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Start</label>
                    <input type="time" className="field" value={d.start_time} onChange={(e) => setDay(i, { start_time: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">End</label>
                    <input type="time" className="field" value={d.end_time} onChange={(e) => setDay(i, { end_time: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Venue</label>
                    <select className="field" value={d.venue_id} onChange={(e) => setDay(i, { venue_id: e.target.value })}>
                      <option value="">Choose venue</option>
                      {venues.map((v) => <option key={v.id} value={v.id}>{v.name}{v.capacity ? ` (max ${v.capacity})` : ""}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Guaranteed pax</label>
                    <input type="number" min={0} className="field" value={d.pax_guaranteed || ""}
                      onChange={(e) => setDay(i, { pax_guaranteed: +e.target.value, pax_expected: d.pax_expected || +e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Expected pax</label>
                    <input type="number" min={0} className={`field ${over ? "border-st-issue" : ""}`} value={d.pax_expected || ""}
                      onChange={(e) => setDay(i, { pax_expected: +e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Setup</label>
                    <select className="field" value={d.setup_style} onChange={(e) => setDay(i, { setup_style: e.target.value })}>
                      <option value="">Choose setup</option>
                      {setupStyles.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Room notes</label>
                    <input className="field" placeholder="Stage, flags, registration desk..." value={d.notes} onChange={(e) => setDay(i, { notes: e.target.value })} />
                  </div>
                </div>
                {over && <p className="mt-1 text-xs text-st-issue">Above {venue!.name} capacity ({venue!.capacity}).</p>}

                <div className="mt-3">
                  <p className="label">F&amp;B for this day</p>
                  {d.fnb.map((f, j) => (
                    <div key={j} className="mb-2 grid grid-cols-12 gap-2">
                      <input type="time" aria-label="Serve time" className="field col-span-3 md:col-span-2" value={f.serve_time}
                        onChange={(e) => setDay(i, { fnb: d.fnb.map((x, k) => (k === j ? { ...x, serve_time: e.target.value } : x)) })} />
                      <input list="fnb-presets" aria-label="Item" placeholder="Item" className="field col-span-9 md:col-span-3" value={f.item}
                        onChange={(e) => setDay(i, { fnb: d.fnb.map((x, k) => (k === j ? { ...x, item: e.target.value } : x)) })} />
                      <input aria-label="Menu" placeholder="Menu / package" className="field col-span-6 md:col-span-3" value={f.menu_ref}
                        onChange={(e) => setDay(i, { fnb: d.fnb.map((x, k) => (k === j ? { ...x, menu_ref: e.target.value } : x)) })} />
                      <input type="number" aria-label="Pax" placeholder={`${d.pax_guaranteed || "pax"}`} className="field col-span-3 md:col-span-1" value={f.pax ?? ""}
                        onChange={(e) => setDay(i, { fnb: d.fnb.map((x, k) => (k === j ? { ...x, pax: e.target.value ? +e.target.value : null } : x)) })} />
                      <input aria-label="Notes" placeholder="Notes" className="field col-span-2 md:col-span-2" value={f.notes}
                        onChange={(e) => setDay(i, { fnb: d.fnb.map((x, k) => (k === j ? { ...x, notes: e.target.value } : x)) })} />
                      <button type="button" aria-label="Remove item" className="col-span-1 text-muted hover:text-st-cancelled"
                        onClick={() => setDay(i, { fnb: d.fnb.filter((_, k) => k !== j) })}>✕</button>
                    </div>
                  ))}
                  <button type="button" className="text-sm font-medium text-corniche hover:underline"
                    onClick={() => setDay(i, { fnb: [...d.fnb, { serve_time: d.start_time, item: "", menu_ref: "", pax: null, notes: "" }] })}>
                    Add F&amp;B item
                  </button>
                </div>
                <div className="mt-3 flex justify-end">
                  <button type="button" className="text-xs text-muted hover:text-st-cancelled" onClick={() => set("days", s.days.filter((_, k) => k !== i))}>Remove this day</button>
                </div>
              </div>
            );
          })}
        </div>
        <datalist id="fnb-presets">{FNB_PRESETS.map((p) => <option key={p} value={p} />)}</datalist>
      </section>

      {/* Departments */}
      <section className="panel p-4">
        <h2 className="section-title mb-1">Department requirements</h2>
        <p className="mb-3 text-sm text-muted">Banquet, F&amp;B, Kitchen and Accounts tasks are created from the days and prices above. Write anything extra here, or tick &ldquo;No requirements&rdquo;.</p>
        <div className="divide-y divide-line">
          {departments.filter((d) => d.code !== "sales").map((dep) => {
            const n = notesFor(dep.code);
            const auto = AUTO.includes(dep.code);
            return (
              <div key={dep.code} className="grid gap-2 py-3 md:grid-cols-[160px_1fr_110px_150px] md:items-start">
                <p className="pt-1.5 text-sm font-medium">{dep.name}{auto && <span className="block text-xs font-normal text-muted">Auto tasks</span>}</p>
                <textarea rows={1} className="field min-h-[34px]" disabled={n.not_required} placeholder={auto ? "Extra instructions (optional)" : "Requirements"}
                  value={n.notes} onChange={(e) => setNote(dep.code, { notes: e.target.value })} />
                <input type="time" aria-label={`${dep.name} ready by`} title="Ready by" className="field" disabled={n.not_required}
                  value={n.ready_by} onChange={(e) => setNote(dep.code, { ready_by: e.target.value })} />
                <label className="flex items-center gap-2 pt-1.5 text-sm">
                  <input type="checkbox" checked={n.not_required} onChange={(e) => setNote(dep.code, { not_required: e.target.checked, notes: e.target.checked ? "" : n.notes })} />
                  No requirements
                </label>
              </div>
            );
          })}
        </div>
      </section>

      {/* Accounts */}
      <section className="panel p-4">
        <h2 className="section-title mb-3">Accounts</h2>
        <div className="grid gap-3 md:grid-cols-6">
          <div>
            <label className="label">Rate (SR)</label>
            <input type="number" min={0} className="field" value={s.rate || ""} onChange={(e) => set("rate", +e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="label">Charged</label>
            <select className="field" value={s.pricing_unit} onChange={(e) => set("pricing_unit", e.target.value as SheetInput["pricing_unit"])}>
              <option value="per_day">Per day (room hire)</option>
              <option value="per_pax_per_day">Per person per day</option>
              <option value="package">Package (fixed)</option>
            </select>
          </div>
          {s.pricing_unit === "per_pax_per_day" && (
            <div>
              <label className="label">Pax</label>
              <input type="number" className="field" value={s.pricing_pax || ""} onChange={(e) => set("pricing_pax", +e.target.value)} />
            </div>
          )}
          {s.pricing_unit !== "package" && (
            <div>
              <label className="label">Days</label>
              <input type="number" min={1} className="field" value={s.pricing_days}
                onChange={(e) => set("pricing_days", Math.max(1, +e.target.value))} />
              {s.days.length > 0 && s.pricing_days !== s.days.length && (
                <button type="button" className="mt-1 text-xs text-corniche hover:underline" onClick={() => set("pricing_days", s.days.length)}>Use {s.days.length}</button>
              )}
            </div>
          )}
          <div>
            <label className="label">Received (SR)</label>
            <input type="number" min={0} className="field" value={s.deposit || ""} onChange={(e) => set("deposit", +e.target.value)} />
          </div>
          <div>
            <label className="label">Payment method</label>
            <input list="pay-methods" className="field" value={s.payment_method} onChange={(e) => set("payment_method", e.target.value)} />
            <datalist id="pay-methods"><option value="Bank transfer" /><option value="Card" /><option value="Cash" /><option value="Credit (city ledger)" /></datalist>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-1 rounded bg-corniche-soft px-4 py-3 text-sm">
          <span>Subtotal <strong>SR {fmt(totals.subtotal)}</strong></span>
          <span>VAT {vatRate}% <strong>SR {fmt(totals.vat_amount)}</strong></span>
          <span className="text-base">Total <strong>SR {fmt(totals.total)}</strong></span>
          <span className={balance > 0 ? "text-st-issue" : "text-st-done"}>
            {balance > 0 ? `Balance due SR ${fmt(balance)}` : balance < 0 ? `Overpaid SR ${fmt(-balance)}` : "Fully paid"}
          </span>
        </div>
      </section>

      <div className="no-print fixed inset-x-0 bottom-0 border-t border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-2 px-4 py-3">
          {!isDraft && <span className="mr-auto text-sm text-muted">Saving creates a new revision and notifies departments of what changed.</span>}
          {isDraft && <button className="btn-ghost" disabled={pending} onClick={() => submit(false)}>Save draft</button>}
          <button className="btn-primary" disabled={pending} onClick={() => submit(true)}>
            {pending ? "Saving..." : isDraft ? "Submit to departments" : "Save revision"}
          </button>
        </div>
      </div>
    </div>
  );
}
