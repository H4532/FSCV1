import type { PricingUnit } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Accounts block: e.g. SR 500 per day x 2 days + 15% VAT = 1,150. */
export function computeTotals(rate: number, unit: PricingUnit, pax: number, days: number, vatRate: number) {
  const base =
    unit === "package" ? rate : unit === "per_pax_per_day" ? rate * Math.max(pax, 0) * Math.max(days, 1) : rate * Math.max(days, 1);
  const subtotal = r2(base);
  const vat_amount = r2((subtotal * vatRate) / 100);
  return { subtotal, vat_amount, total: r2(subtotal + vat_amount) };
}

export function pricingFormula(rate: number, unit: PricingUnit, pax: number, days: number, vatRate: number) {
  const t = computeTotals(rate, unit, pax, days, vatRate);
  const base =
    unit === "package"
      ? `SR ${fmt(rate)} package`
      : unit === "per_pax_per_day"
        ? `SR ${fmt(rate)} x ${pax} pax x ${days} day${days > 1 ? "s" : ""}`
        : `SR ${fmt(rate)} x ${days} day${days > 1 ? "s" : ""}`;
  return `${base} + ${vatRate}% VAT = SR ${fmt(t.total)}`;
}

export const fmt = (n: number) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
