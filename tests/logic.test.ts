// Run: npx tsx tests/logic.test.ts
import assert from "node:assert/strict";
import { buildTasks } from "../src/lib/tasks";
import { diffSnapshots } from "../src/lib/diff";
import { computeTotals, pricingFormula } from "../src/lib/calc";
import type { SheetSnapshot } from "../src/lib/types";

const uaefa: SheetSnapshot = {
  sheet_no: "FS-2026-0001", status: "submitted", revision: 1, sales_name: "Sales",
  account_name: "United Arab Emirates Football Association", booking_name: "United Arab Emirates Football Association",
  contact_name: "Mr. A", contact_phone: "+971", contact_email: "a@uaefa.ae", event_type: "Meeting", description: "Meeting and Lunch",
  rate: 500, pricing_unit: "per_day", pricing_pax: 0, pricing_days: 2, vat_rate: 15, subtotal: 1000, vat_amount: 150, total: 1150,
  deposit: 1150, payment_method: "Bank transfer", accounts_notes: "",
  days: ["2026-10-02", "2026-10-03"].map((date) => ({
    event_date: date, venue_id: "v2", venue_name: "Corniche 2", start_time: "11:00", end_time: "15:00",
    pax_guaranteed: 35, pax_expected: 35, setup_style: "U-shape", notes: "",
    fnb: [
      { serve_time: "11:00", item: "Water", menu_ref: "", pax: 35, notes: "" },
      { serve_time: "13:00", item: "Lunch", menu_ref: "Buffet A", pax: 35, notes: "" },
    ],
  })),
  departments: [
    { department_code: "housekeeping", notes: "Venue ready", not_required: false, ready_by: "12:00" },
    { department_code: "hr", notes: "", not_required: true, ready_by: "" },
  ],
};

// Accounts: the original sheet's formula
assert.deepEqual(computeTotals(500, "per_day", 0, 2, 15), { subtotal: 1000, vat_amount: 150, total: 1150 });
assert.equal(pricingFormula(500, "per_day", 0, 2, 15), "SR 500 x 2 days + 15% VAT = SR 1,150");
assert.equal(computeTotals(120, "per_pax_per_day", 35, 2, 15).total, 9660);

// Tasks
const t1 = buildTasks(uaefa, 30);
const by = (d: string) => t1.filter((t) => t.department_code === d);
assert.equal(by("banquet").length, 2, "one setup task per day");
assert.equal(by("fnb").length, 4, "water + lunch per day");
assert.equal(by("kitchen").length, 2, "kitchen only for lunch, not water");
assert.equal(by("housekeeping").length, 2);
assert.equal(by("hr").length, 0, "HR ticked No requirements");
assert.equal(by("accounts").length, 1);
assert.match(by("accounts")[0].title, /Verify payment received SR 1150/);
const setup = by("banquet")[0];
assert.equal(setup.ready_by, new Date("2026-10-02T10:30:00+03:00").toISOString(), "ready 30 min before 11:00");
assert.equal(by("housekeeping")[0].ready_by, new Date("2026-10-02T12:00:00+03:00").toISOString());

// Revision: pax 35 -> 40 on Oct 2 only
const rev2: SheetSnapshot = JSON.parse(JSON.stringify(uaefa));
rev2.revision = 2;
rev2.days[0].pax_guaranteed = 40;
rev2.days[0].pax_expected = 40;
const t2 = buildTasks(rev2, 30);
const changed = t2.filter((t) => t1.find((o) => o.task_key === t.task_key)?.content_hash !== t.content_hash).map((t) => t.task_key);
assert.deepEqual(changed, ["2026-10-02:banquet:setup"], "only Oct 2 setup resets (F&B items have explicit pax 35)");
const diff = diffSnapshots(uaefa, rev2);
assert.ok(diff.some((d) => d.includes("pax: 35 -> 40")), diff.join("|"));

// Revision: lunch moved to 13:30 on Oct 3 -> that day's lunch F&B task is replaced
const rev3: SheetSnapshot = JSON.parse(JSON.stringify(uaefa));
rev3.days[1].fnb[1].serve_time = "13:30";
const t3 = buildTasks(rev3, 30);
assert.ok(!t3.some((t) => t.task_key === "fnb:2026-10-03:lunch:13:00"));
assert.ok(t3.some((t) => t.task_key === "fnb:2026-10-03:lunch:13:30"));
assert.ok(diffSnapshots(uaefa, rev3).some((d) => d.includes("F&B")));

console.log(`All logic tests passed. ${t1.length} tasks for the UAE FA sheet:`);
for (const t of t1) console.log(`  [${t.department_code}] ${t.title}  (ready by ${new Date(t.ready_by!).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })})`);
