import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "./supabase/server";
import type { Department, Profile, SheetSnapshot } from "./types";

export async function requireUser() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).single();
  return { sb, user, profile: profile as Profile };
}

export async function requireSales() {
  const ctx = await requireUser();
  if (!["admin", "sales"].includes(ctx.profile.role)) throw new Error("Only Sales or Admin can do this.");
  return ctx;
}

export async function getSettings(sb: SupabaseClient) {
  const { data } = await sb.from("settings").select("key, value");
  const m = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  return {
    hotel: (m.hotel ?? { name: "Hotel", footer: "" }) as { name: string; footer: string },
    vat_rate: Number(m.vat_rate ?? 15),
    routing_mode: (m.routing_mode ?? "by_content") as "all" | "by_content",
    lead_minutes: Number(m.lead_minutes ?? 30),
    feedback_edit_hours: Number(m.feedback_edit_hours ?? 24),
    survey_enabled: m.survey_enabled !== false,
  };
}

export async function getDepartments(sb: SupabaseClient) {
  const { data } = await sb.from("departments").select("*").eq("active", true).order("sort_order");
  return (data ?? []) as Department[];
}

/** Reads the current state of a sheet in the same shape that is stored in revision snapshots. */
export async function loadSnapshot(sb: SupabaseClient, eventId: string): Promise<SheetSnapshot | null> {
  const { data: e } = await sb
    .from("events")
    .select("*, sales:profiles!events_sales_user_id_fkey(full_name), event_days(*, event_fnb_items(*)), department_notes(*)")
    .eq("id", eventId)
    .single();
  if (!e) return null;
  const days = [...(e.event_days ?? [])].sort((a: any, b: any) => a.event_date.localeCompare(b.event_date));
  return {
    id: e.id,
    sheet_no: e.sheet_no,
    status: e.status,
    revision: e.revision,
    account_name: e.account_name,
    booking_name: e.booking_name,
    contact_name: e.contact_name ?? "",
    contact_phone: e.contact_phone ?? "",
    contact_email: e.contact_email ?? "",
    event_type: e.event_type,
    description: e.description ?? "",
    rate: Number(e.rate),
    pricing_unit: e.pricing_unit,
    pricing_pax: e.pricing_pax,
    pricing_days: e.pricing_days,
    vat_rate: Number(e.vat_rate),
    subtotal: Number(e.subtotal),
    vat_amount: Number(e.vat_amount),
    total: Number(e.total),
    deposit: Number(e.deposit),
    payment_method: e.payment_method ?? "",
    accounts_notes: e.accounts_notes ?? "",
    sales_name: e.sales?.full_name ?? null,
    days: days.map((d: any) => ({
      id: d.id,
      event_date: d.event_date,
      venue_id: d.venue_id ?? "",
      venue_name: d.venue_name ?? "",
      start_time: d.start_time.slice(0, 5),
      end_time: d.end_time.slice(0, 5),
      pax_guaranteed: d.pax_guaranteed,
      pax_expected: d.pax_expected,
      setup_style: d.setup_style ?? "",
      notes: d.notes ?? "",
      fnb: [...(d.event_fnb_items ?? [])]
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((f: any) => ({
          serve_time: f.serve_time ? f.serve_time.slice(0, 5) : "",
          item: f.item,
          menu_ref: f.menu_ref ?? "",
          pax: f.pax,
          notes: f.notes ?? "",
        })),
    })),
    departments: (e.department_notes ?? []).map((n: any) => ({
      department_code: n.department_code,
      notes: n.notes ?? "",
      not_required: n.not_required,
      ready_by: n.ready_by ? n.ready_by.slice(0, 5) : "",
    })),
  };
}
