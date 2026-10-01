"use server";

import { revalidatePath } from "next/cache";
import { requireSales, requireUser } from "@/lib/data";

const done = () => revalidatePath("/settings");

export async function addRecipient(fd: FormData) {
  const { sb } = await requireSales();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
  await sb.from("recipients").upsert(
    { department_code: String(fd.get("department_code")), email, name: String(fd.get("name") ?? "") || null, active: true },
    { onConflict: "department_code,email" }
  );
  done();
}
export async function toggleRecipient(id: string, active: boolean) {
  const { sb } = await requireSales();
  await sb.from("recipients").update({ active }).eq("id", id);
  done();
}
export async function removeRecipient(id: string) {
  const { sb } = await requireSales();
  await sb.from("recipients").delete().eq("id", id);
  done();
}
export async function saveDepartment(fd: FormData) {
  const { sb } = await requireSales();
  const code = String(fd.get("code") ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!code) throw new Error("Department code is required.");
  await sb.from("departments").upsert({
    code,
    name: String(fd.get("name") ?? code),
    escalation_email: String(fd.get("escalation_email") ?? "") || null,
    sort_order: Number(fd.get("sort_order") ?? 50),
    active: fd.get("active") !== "off",
  });
  done();
}
export async function saveVenue(fd: FormData) {
  const { sb } = await requireSales();
  const id = String(fd.get("id") ?? "");
  const row = { name: String(fd.get("name")).trim(), capacity: Number(fd.get("capacity")) || null, active: fd.get("active") !== "off" };
  if (id) await sb.from("venues").update(row).eq("id", id);
  else await sb.from("venues").insert(row);
  done();
}
export async function saveSetupStyle(fd: FormData) {
  const { sb } = await requireSales();
  const name = String(fd.get("name") ?? "").trim();
  if (name) await sb.from("setup_styles").upsert({ name, active: true }, { onConflict: "name" });
  done();
}
export async function removeSetupStyle(id: string) {
  const { sb } = await requireSales();
  await sb.from("setup_styles").update({ active: false }).eq("id", id);
  done();
}
export async function saveGeneral(fd: FormData) {
  const { sb } = await requireSales();
  const rows = [
    { key: "hotel", value: { name: String(fd.get("hotel_name")), footer: String(fd.get("footer") ?? "") } },
    { key: "vat_rate", value: Number(fd.get("vat_rate")) },
    { key: "routing_mode", value: String(fd.get("routing_mode")) },
    { key: "lead_minutes", value: Number(fd.get("lead_minutes")) },
    { key: "feedback_edit_hours", value: Number(fd.get("feedback_edit_hours")) },
    { key: "survey_enabled", value: fd.get("survey_enabled") === "on" },
  ];
  await sb.from("settings").upsert(rows);
  done();
}
export async function saveUser(fd: FormData) {
  const { sb, profile } = await requireUser();
  if (profile.role !== "admin") throw new Error("Only an admin can change user roles.");
  await sb
    .from("profiles")
    .update({ role: String(fd.get("role")), department_code: String(fd.get("department_code") ?? "") || null })
    .eq("id", String(fd.get("id")));
  done();
}
