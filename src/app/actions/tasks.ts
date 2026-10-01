"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/data";
import { recipientsFor, logMail, sendMail } from "@/lib/emails";
import { esc } from "@/lib/mail";
import { fromLocalInput, fmtDateTime } from "@/lib/time";
import type { TaskStatus } from "@/lib/types";

export interface TaskUpdateInput {
  taskId: string;
  status: TaskStatus;
  eta: string;          // datetime-local value (hotel time)
  comment: string;
  attachments: { path: string; name: string; mime: string; size: number }[];
}

export async function updateTask(input: TaskUpdateInput): Promise<{ ok: boolean; error?: string }> {
  const { sb, user, profile } = await requireUser();
  const { data: task } = await sb
    .from("event_tasks")
    .select("*, events(id, sheet_no, booking_name, status), departments(name, escalation_email)")
    .eq("id", input.taskId)
    .single();
  if (!task) return { ok: false, error: "Task not found." };
  const canEdit = ["admin", "sales"].includes(profile.role) || profile.department_code === task.department_code;
  if (!canEdit) return { ok: false, error: "You can only update your own department's tasks." };
  if (["completed", "cancelled"].includes(task.events.status)) return { ok: false, error: "This event is closed." };

  const eta = input.status === "in_progress" ? fromLocalInput(input.eta) : null;
  if (input.status === "in_progress" && !eta) return { ok: false, error: "Enter the estimated finish date and time." };
  if (["issue", "na", "cancelled"].includes(input.status) && !input.comment.trim())
    return { ok: false, error: "A comment is required for Issue, N/A and Cancelled." };

  const { error } = await sb
    .from("event_tasks")
    .update({ status: input.status, eta, status_comment: input.comment || null, alert_sent_at: null })
    .eq("id", task.id);
  if (error) return { ok: false, error: error.message };

  const { data: upd } = await sb
    .from("task_updates")
    .insert({ task_id: task.id, old_status: task.status, new_status: input.status, eta, comment: input.comment || null, user_id: user.id })
    .select("id")
    .single();

  if (input.attachments.length && upd) {
    await sb.from("attachments").insert(
      input.attachments.map((a) => ({
        event_id: task.event_id, task_update_id: upd.id, file_path: a.path, file_name: a.name,
        mime_type: a.mime, size_bytes: a.size, uploaded_by: user.id, caption: `Task: ${task.title}`,
      }))
    );
  }

  // Alerts to Sales (+ department escalation contact) when something needs attention
  const late = eta && task.ready_by && new Date(eta) > new Date(task.ready_by);
  if (input.status === "issue" || late) {
    const to = [...(await recipientsFor(sb, ["sales"])), task.departments?.escalation_email].filter(Boolean) as string[];
    const what = input.status === "issue" ? "ISSUE reported" : "Will finish AFTER deadline";
    const subject = `${what}: ${task.departments?.name} - ${task.events.booking_name} (${task.events.sheet_no})`;
    const html = `<p><strong>${esc(what)}</strong> by ${esc(profile.full_name)}</p>
      <p>Task: ${esc(task.title)}<br>Ready by: ${esc(fmtDateTime(task.ready_by))}${eta ? `<br>ETA: ${esc(fmtDateTime(eta))}` : ""}</p>
      ${input.comment ? `<p>Comment: ${esc(input.comment)}</p>` : ""}
      <p><a href="${process.env.APP_BASE_URL}/sheets/${task.event_id}?tab=followup">Open follow-up</a></p>`;
    await logMail(sb, { event_id: task.event_id, kind: "alert", recipients: to, subject }, () => sendMail({ to, subject, html }));
  }

  // All done -> tell Sales the event is ready
  const { data: open } = await sb
    .from("event_tasks").select("id").eq("event_id", task.event_id).not("status", "in", "(done,na,cancelled)");
  if (!open?.length && input.status === "done") {
    const to = await recipientsFor(sb, ["sales"]);
    const subject = `Event ready: ${task.events.booking_name} (${task.events.sheet_no})`;
    await logMail(sb, { event_id: task.event_id, kind: "alert", recipients: to, subject }, () =>
      sendMail({ to, subject, html: `<p>All department tasks for ${esc(task.events.booking_name)} are done or not applicable.</p>` })
    );
  }

  revalidatePath(`/sheets/${task.event_id}`);
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}
