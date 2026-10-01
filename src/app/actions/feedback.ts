"use server";

import { revalidatePath } from "next/cache";
import { requireUser, getSettings } from "@/lib/data";
import { supabaseAdmin } from "@/lib/supabase/server";
import { createAndSendSurvey } from "@/lib/survey";

export interface FeedbackInput {
  eventId: string;
  type: "remark" | "incident" | "client";
  department_code: string;
  category: string;
  text: string;
  rating: number | null;
  severity: "low" | "medium" | "high" | null;
  attachments: { path: string; name: string; mime: string; size: number; caption: string }[];
}

export async function addFeedback(input: FeedbackInput): Promise<{ ok: boolean; error?: string }> {
  const { sb, user, profile } = await requireUser();
  if (!input.text.trim() && !input.attachments.length) return { ok: false, error: "Write a remark or attach a file." };
  if (input.type === "incident" && !input.severity) return { ok: false, error: "Choose the incident severity." };
  const { data: fb, error } = await sb
    .from("event_feedback")
    .insert({
      event_id: input.eventId,
      department_code: input.department_code || profile.department_code,
      type: input.type,
      category: input.category || null,
      text: input.text.trim() || "(materials)",
      rating: input.rating,
      severity: input.type === "incident" ? input.severity : null,
      author: user.id,
    })
    .select("id")
    .single();
  if (error || !fb) return { ok: false, error: error?.message };
  if (input.attachments.length) {
    await sb.from("attachments").insert(
      input.attachments.map((a) => ({
        event_id: input.eventId, feedback_id: fb.id, file_path: a.path, file_name: a.name,
        mime_type: a.mime, size_bytes: a.size, caption: a.caption || null, uploaded_by: user.id,
      }))
    );
  }
  revalidatePath(`/sheets/${input.eventId}`);
  return { ok: true };
}

export async function editFeedback(id: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const { sb, user, profile } = await requireUser();
  const settings = await getSettings(sb);
  const { data: fb } = await sb.from("event_feedback").select("author, created_at, event_id").eq("id", id).single();
  if (!fb) return { ok: false, error: "Remark not found." };
  const ageH = (Date.now() - new Date(fb.created_at).getTime()) / 3600000;
  if (profile.role !== "admin" && (fb.author !== user.id || ageH > settings.feedback_edit_hours))
    return { ok: false, error: `Remarks can be edited by their author for ${settings.feedback_edit_hours} hours.` };
  await sb.from("event_feedback").update({ text }).eq("id", id);
  revalidatePath(`/sheets/${fb.event_id}`);
  return { ok: true };
}

export async function toggleResolved(id: string, resolved: boolean) {
  const { sb } = await requireUser();
  const { data } = await sb.from("event_feedback").update({ resolved }).eq("id", id).select("event_id").single();
  if (data) revalidatePath(`/sheets/${data.event_id}`);
}

/** Signed URL for viewing a stored file (private bucket). */
export async function signedUrl(path: string) {
  const { sb } = await requireUser();
  const { data } = await sb.storage.from("materials").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Emails the client a one-page rating form. Also called automatically by the cron job after the event. */
export async function sendSurvey(eventId: string) {
  const { sb } = await requireUser();
  await createAndSendSurvey(sb, eventId);
  revalidatePath(`/sheets/${eventId}`);
}

/** Public: client submits the survey (no login). */
export async function submitSurvey(token: string, ratings: Record<string, number>, comment: string) {
  const sb = supabaseAdmin();
  const { data: s } = await sb.from("client_surveys").select("event_id, submitted_at").eq("token", token).single();
  if (!s) return { ok: false, error: "This survey link is not valid." };
  if (s.submitted_at) return { ok: false, error: "This survey was already submitted. Thank you." };
  await sb.from("client_surveys").update({ ratings, comment, submitted_at: new Date().toISOString() }).eq("token", token);
  const vals = Object.values(ratings).filter((n) => n > 0);
  const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  await sb.from("event_feedback").insert({
    event_id: s.event_id, type: "client", department_code: "sales",
    text: `Client survey: ${Object.entries(ratings).map(([k, v]) => `${k} ${v}/5`).join(", ")}${comment ? `. "${comment}"` : ""}`,
    rating: avg,
  });
  return { ok: true };
}
