"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSales, requireUser, getSettings, loadSnapshot } from "@/lib/data";
import { computeTotals } from "@/lib/calc";
import { buildTasks, involvedDepartments } from "@/lib/tasks";
import { diffSnapshots } from "@/lib/diff";
import { recipientsFor, sheetEmailHtml, logMail, sendMail } from "@/lib/emails";
import { fmtDate } from "@/lib/time";
import type { SheetInput, SheetSnapshot } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SaveResult = { ok: true; id: string; warnings: string[] } | { ok: false; errors: string[] };

const AUTO_DEPTS = ["sales", "banquet", "fnb", "kitchen", "accounts"]; // filled automatically from days / F&B / accounts

async function validate(sb: SupabaseClient, input: SheetInput, submit: boolean) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!input.account_name.trim()) errors.push("Enter the account name.");
  if (!input.booking_name.trim()) errors.push("Enter the booking name.");
  if (!input.days.length) errors.push("Add at least one event day.");

  const seen = new Set<string>();
  const { data: venues } = await sb.from("venues").select("id, name, capacity");
  const venueMap = new Map((venues ?? []).map((v) => [v.id, v]));

  for (const [i, d] of input.days.entries()) {
    const L = d.event_date ? fmtDate(d.event_date) : `Day ${i + 1}`;
    if (!d.event_date) errors.push(`${L}: choose a date.`);
    if (seen.has(d.event_date)) errors.push(`${L} is entered twice. Use one row per date.`);
    seen.add(d.event_date);
    if (!d.venue_id) errors.push(`${L}: choose a venue.`);
    if (!d.start_time || !d.end_time || d.end_time <= d.start_time) errors.push(`${L}: end time must be after start time.`);
    if (d.pax_guaranteed <= 0) errors.push(`${L}: enter the guaranteed pax.`);
    const v = venueMap.get(d.venue_id);
    if (v?.capacity && d.pax_expected > v.capacity) warnings.push(`${L}: ${d.pax_expected} pax is above ${v.name} capacity (${v.capacity}).`);

    // Venue clash with other active sheets
    if (d.venue_id && d.event_date && d.start_time && d.end_time) {
      const { data: clash } = await sb
        .from("event_days")
        .select("start_time, end_time, events!inner(id, sheet_no, booking_name, status)")
        .eq("venue_id", d.venue_id)
        .eq("event_date", d.event_date)
        .lt("start_time", d.end_time)
        .gt("end_time", d.start_time)
        .neq("events.status", "cancelled");
      const other = (clash ?? []).find((c: any) => c.events.id !== input.id);
      if (other) {
        const ev = (other as any).events;
        errors.push(`${L}: ${v?.name ?? "venue"} is already booked ${other.start_time.slice(0, 5)}-${other.end_time.slice(0, 5)} by ${ev.booking_name} (${ev.sheet_no}).`);
      }
    }
    if (submit && !d.fnb.length) warnings.push(`${L}: no F&B items. Add at least water if anything is served.`);
  }

  if (submit) {
    if (!input.contact_name.trim() || !input.contact_phone.trim()) errors.push("Enter the client contact name and phone before submitting.");
    const lunchMentioned = /lunch|dinner|breakfast|coffee/i.test(`${input.description} ${input.event_type}`);
    const fnbText = input.days.flatMap((d) => d.fnb.map((f) => f.item)).join(" ");
    if (lunchMentioned && !/lunch|dinner|breakfast|coffee/i.test(fnbText))
      errors.push("The description mentions a meal, but no meal is listed under F&B. Add it to the F&B items.");
    const { data: depts } = await sb.from("departments").select("code, name").eq("active", true);
    for (const dep of depts ?? []) {
      if (AUTO_DEPTS.includes(dep.code)) continue;
      const n = input.departments.find((x) => x.department_code === dep.code);
      if (!n || (!n.not_required && !n.notes.trim()))
        errors.push(`${dep.name}: write the requirements or tick "No requirements".`);
    }
  }
  return { errors, warnings, venueMap };
}

export async function saveSheet(input: SheetInput, submit: boolean): Promise<SaveResult> {
  const { sb, user } = await requireSales();
  const settings = await getSettings(sb);

  let existing: { status: string; revision: number } | null = null;
  if (input.id) {
    const { data } = await sb.from("events").select("status, revision").eq("id", input.id).single();
    existing = data;
    if (!existing) return { ok: false, errors: ["This sheet no longer exists."] };
    if (["completed", "cancelled"].includes(existing.status))
      return { ok: false, errors: ["Completed and cancelled sheets are locked. Ask an admin to reopen it."] };
  }
  const publishing = submit || (existing && existing.status !== "draft");
  const { errors, warnings, venueMap } = await validate(sb, input, !!publishing);
  if (errors.length) return { ok: false, errors };

  const totals = computeTotals(input.rate, input.pricing_unit, input.pricing_pax, input.pricing_days, settings.vat_rate);

  // Account master: create on first use, keep contact details current
  const { data: acc } = await sb
    .from("accounts")
    .upsert(
      { name: input.account_name.trim(), contact_name: input.contact_name, contact_phone: input.contact_phone, contact_email: input.contact_email },
      { onConflict: "name" }
    )
    .select("id")
    .single();

  const row = {
    account_id: acc?.id ?? null,
    account_name: input.account_name.trim(),
    booking_name: input.booking_name.trim(),
    contact_name: input.contact_name,
    contact_phone: input.contact_phone,
    contact_email: input.contact_email,
    event_type: input.event_type,
    description: input.description,
    rate: input.rate,
    pricing_unit: input.pricing_unit,
    pricing_pax: input.pricing_pax,
    pricing_days: input.pricing_days,
    vat_rate: settings.vat_rate,
    ...totals,
    deposit: input.deposit,
    payment_method: input.payment_method,
    accounts_notes: input.accounts_notes,
  };

  let id = input.id;
  if (id) {
    const { error } = await sb.from("events").update(row).eq("id", id);
    if (error) return { ok: false, errors: [error.message] };
    await sb.from("event_days").delete().eq("event_id", id);
    await sb.from("department_notes").delete().eq("event_id", id);
  } else {
    const { data, error } = await sb.from("events").insert({ ...row, sales_user_id: user.id }).select("id").single();
    if (error || !data) return { ok: false, errors: [error?.message ?? "Could not create the sheet."] };
    id = data.id as string;
  }

  const days = [...input.days].sort((a, b) => a.event_date.localeCompare(b.event_date));
  for (const [i, d] of days.entries()) {
    const { data: dayRow, error } = await sb
      .from("event_days")
      .insert({
        event_id: id,
        event_date: d.event_date,
        venue_id: d.venue_id || null,
        venue_name: venueMap.get(d.venue_id)?.name ?? null,
        start_time: d.start_time,
        end_time: d.end_time,
        pax_guaranteed: d.pax_guaranteed,
        pax_expected: d.pax_expected || d.pax_guaranteed,
        setup_style: d.setup_style || null,
        notes: d.notes || null,
        sort_order: i,
      })
      .select("id")
      .single();
    if (error || !dayRow) return { ok: false, errors: [error?.message ?? "Could not save event days."] };
    const fnb = d.fnb
      .filter((f) => f.item.trim())
      .map((f, j) => ({
        event_id: id,
        event_day_id: dayRow.id,
        serve_time: f.serve_time || null,
        item: f.item.trim(),
        menu_ref: f.menu_ref || null,
        pax: f.pax || null,
        notes: f.notes || null,
        sort_order: j,
      }));
    if (fnb.length) await sb.from("event_fnb_items").insert(fnb);
  }
  const notes = input.departments
    .filter((n) => n.notes.trim() || n.not_required)
    .map((n) => ({ event_id: id, department_code: n.department_code, notes: n.notes || null, not_required: n.not_required, ready_by: n.ready_by || null }));
  if (notes.length) await sb.from("department_notes").insert(notes);

  if (publishing) await publishRevision(sb, id!, user.id, settings);

  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath(`/sheets/${id}`);
  return { ok: true, id: id!, warnings };
}

/** Creates the next revision snapshot, syncs department tasks and emails recipients. */
async function publishRevision(sb: SupabaseClient, id: string, userId: string, settings: Awaited<ReturnType<typeof getSettings>>) {
  const current = await loadSnapshot(sb, id);
  if (!current) return;
  const { data: last } = await sb
    .from("revisions")
    .select("rev_no, snapshot")
    .eq("event_id", id)
    .order("rev_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prev = (last?.snapshot as SheetSnapshot) ?? null;
  const rev = (last?.rev_no ?? 0) + 1;
  const snapshot: SheetSnapshot = { ...current, revision: rev, status: current.status === "draft" ? "submitted" : current.status };
  const changes = diffSnapshots(prev, snapshot);
  if (prev && !changes.length) return; // nothing changed, no new revision

  await sb.from("revisions").insert({ event_id: id, rev_no: rev, snapshot, change_summary: changes, changed_by: userId });
  await sb
    .from("events")
    .update({ revision: rev, status: snapshot.status, ...(rev === 1 ? { submitted_at: new Date().toISOString() } : {}) })
    .eq("id", id);

  const desired = buildTasks(snapshot, settings.lead_minutes);
  await syncTasks(sb, id, snapshot, desired, rev, userId);

  const depts = settings.routing_mode === "all" ? "all" : Array.from(involvedDepartments(snapshot, desired));
  const to = await recipientsFor(sb, depts);
  const subject = `${rev > 1 ? `REVISED (Rev ${rev}) ` : ""}Function sheet ${snapshot.sheet_no} - ${snapshot.booking_name} - ${snapshot.days
    .map((d) => fmtDate(d.event_date))
    .join(" & ")}`;
  const html = sheetEmailHtml(snapshot, id, settings.hotel.name, changes);
  await logMail(sb, { event_id: id, rev_no: rev, kind: "sheet", recipients: to, subject }, () => sendMail({ to, subject, html }));
}

async function syncTasks(sb: SupabaseClient, eventId: string, s: SheetSnapshot, desired: ReturnType<typeof buildTasks>, rev: number, userId: string) {
  const { data: existing } = await sb.from("event_tasks").select("*").eq("event_id", eventId);
  const byKey = new Map((existing ?? []).map((t) => [t.task_key, t]));
  const dayId = new Map(s.days.map((d) => [d.event_date, d.id ?? null]));
  const keep = new Set<string>();

  for (const t of desired) {
    keep.add(t.task_key);
    const old = byKey.get(t.task_key);
    const fields = {
      title: t.title,
      detail: t.detail,
      ready_by: t.ready_by,
      department_code: t.department_code,
      event_day_id: t.event_date ? dayId.get(t.event_date) ?? null : null,
      content_hash: t.content_hash,
    };
    if (!old) {
      await sb.from("event_tasks").insert({ event_id: eventId, task_key: t.task_key, ...fields, changed_in_rev: rev > 1 ? rev : null });
    } else if (old.content_hash !== t.content_hash || old.status === "cancelled") {
      // Requirement changed: department must reconfirm
      await sb
        .from("event_tasks")
        .update({ ...fields, status: "pending", eta: null, status_comment: null, changed_in_rev: rev, alert_sent_at: null })
        .eq("id", old.id);
      await sb.from("task_updates").insert({
        task_id: old.id, old_status: old.status, new_status: "pending", user_id: userId,
        comment: `Reset: requirement changed in Rev ${rev}`,
      });
    } else {
      await sb.from("event_tasks").update({ ready_by: t.ready_by, event_day_id: fields.event_day_id }).eq("id", old.id);
    }
  }
  for (const old of existing ?? []) {
    if (!keep.has(old.task_key) && old.status !== "cancelled") {
      await sb.from("event_tasks").update({ status: "cancelled", status_comment: `Removed in Rev ${rev}`, changed_in_rev: rev }).eq("id", old.id);
      await sb.from("task_updates").insert({
        task_id: old.id, old_status: old.status, new_status: "cancelled", user_id: userId, comment: `Removed in Rev ${rev}`,
      });
    }
  }
}

export async function setSheetStatus(id: string, status: "confirmed" | "completed" | "cancelled" | "submitted", reason?: string) {
  const { sb, profile } = await requireSales();
  const { data: ev } = await sb.from("events").select("status, sheet_no, booking_name, revision").eq("id", id).single();
  if (!ev) throw new Error("Sheet not found.");
  if (["completed", "cancelled"].includes(ev.status) && profile.role !== "admin")
    throw new Error("Only an admin can reopen a completed or cancelled sheet.");
  if (status === "cancelled" && !reason?.trim()) throw new Error("Give a cancellation reason.");
  await sb.from("events").update({ status, cancelled_reason: status === "cancelled" ? reason : null }).eq("id", id);

  if (status === "cancelled") {
    await sb.from("event_tasks").update({ status: "cancelled", status_comment: `Event cancelled: ${reason}` })
      .eq("event_id", id).not("status", "in", "(done,na,cancelled)");
    const settings = await getSettings(sb);
    const to = await recipientsFor(sb, "all");
    const subject = `CANCELLED: Function sheet ${ev.sheet_no} - ${ev.booking_name}`;
    await logMail(sb, { event_id: id, rev_no: ev.revision, kind: "sheet", recipients: to, subject }, () =>
      sendMail({ to, subject, html: `<p><strong>${settings.hotel.name}</strong></p><p>Function sheet ${ev.sheet_no} (${ev.booking_name}) has been cancelled.</p><p>Reason: ${reason}</p>` })
    );
  }
  revalidatePath(`/sheets/${id}`);
  revalidatePath("/history");
  revalidatePath("/");
}

export async function acknowledgeSheet(id: string) {
  const { sb, user, profile } = await requireUser();
  if (!profile.department_code) throw new Error("Your profile has no department. Ask an admin to set it.");
  const { data: ev } = await sb.from("events").select("revision").eq("id", id).single();
  await sb.from("acknowledgements").upsert(
    { event_id: id, department_code: profile.department_code, rev_no: ev?.revision ?? 1, user_id: user.id },
    { onConflict: "event_id,department_code,rev_no", ignoreDuplicates: true }
  );
  revalidatePath(`/sheets/${id}`);
}

export async function deleteDraft(id: string) {
  const { sb } = await requireSales();
  const { data: ev } = await sb.from("events").select("status").eq("id", id).single();
  if (ev?.status !== "draft") throw new Error("Only drafts can be deleted. Cancel submitted sheets instead.");
  await sb.from("events").delete().eq("id", id);
  redirect("/history");
}
