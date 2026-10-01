"use client";
import { useState, useTransition } from "react";
import { updateTask } from "@/app/actions/tasks";
import { TaskChip } from "./Status";
import { Uploader, type Uploaded } from "./Uploader";
import { fmtDate, fmtDateTime, toLocalInput } from "@/lib/time";
import type { TaskStatus } from "@/lib/types";
import { TASK_STATUS_LABEL } from "@/lib/types";

export interface TaskRow {
  id: string; event_id: string; department_code: string; title: string; detail: string | null; ready_by: string | null;
  status: TaskStatus; eta: string | null; status_comment: string | null; changed_in_rev: number | null; event_date: string | null;
  updates: { new_status: TaskStatus; comment: string | null; eta: string | null; created_at: string; user: string | null }[];
}

const OPTIONS: TaskStatus[] = ["pending", "in_progress", "done", "issue", "na", "cancelled"];
const NEEDS_COMMENT: TaskStatus[] = ["issue", "na", "cancelled"];

export function FollowUp({
  tasks, departments, editableDepts, showEvent = false,
}: {
  tasks: TaskRow[]; departments: Record<string, string>; editableDepts: string[] | "all"; showEvent?: boolean;
}) {
  const canEditDept = (code: string) => editableDepts === "all" || editableDepts.includes(code);
  const [open, setOpen] = useState<string | null>(null);
  const groups = new Map<string, TaskRow[]>();
  tasks.forEach((t) => {
    const k = `${t.event_date ?? ""}|${t.department_code}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  });
  if (!tasks.length) return <p className="panel p-6 text-sm text-muted">No tasks yet. Tasks are created when the sheet is submitted.</p>;

  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([k, list]) => {
        const [date, dept] = k.split("|");
        return (
          <section key={k} className="panel overflow-hidden">
            <header className="flex items-baseline justify-between bg-corniche-soft px-4 py-2">
              <h3 className="font-semibold">{departments[dept] ?? dept}</h3>
              <span className="text-sm text-muted">{date ? fmtDate(date) : "Before the event"}</span>
            </header>
            <ul className="divide-y divide-line">
              {list.map((t) => (
                <TaskItem key={t.id} t={t} editable={canEditDept(t.department_code)} open={open === t.id}
                  onToggle={() => setOpen(open === t.id ? null : t.id)} showEvent={showEvent} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function TaskItem({ t, editable, open, onToggle, showEvent }: { t: TaskRow; editable: boolean; open: boolean; onToggle: () => void; showEvent: boolean }) {
  const [status, setStatus] = useState<TaskStatus>(t.status);
  const [eta, setEta] = useState(toLocalInput(t.eta));
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<Uploaded[]>([]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [showLog, setShowLog] = useState(false);

  const now = Date.now();
  const overdue = !["done", "na", "cancelled"].includes(t.status) && t.ready_by && new Date(t.ready_by).getTime() < now;
  const lateEta = t.status === "in_progress" && t.eta && t.ready_by && new Date(t.eta) > new Date(t.ready_by);

  function save() {
    setError("");
    if (status === "in_progress" && !eta) return setError("Enter the estimated finish time.");
    if (NEEDS_COMMENT.includes(status) && !comment.trim()) return setError(`A comment is required for ${TASK_STATUS_LABEL[status]}.`);
    start(async () => {
      const r = await updateTask({ taskId: t.id, status, eta, comment, attachments: files });
      if (!r.ok) setError(r.error ?? "Could not update the task.");
      else { setComment(""); setFiles([]); onToggle(); }
    });
  }

  return (
    <li className={`px-4 py-3 ${overdue ? "bg-st-cancelled/5" : lateEta ? "bg-st-issue/5" : ""}`}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {t.title}
            {t.changed_in_rev && t.status === "pending" && (
              <span className="ml-2 rounded bg-st-issue/15 px-1.5 py-0.5 text-[11px] font-semibold text-st-issue">Changed in Rev {t.changed_in_rev}</span>
            )}
          </p>
          {t.detail && <p className="text-sm text-muted">{t.detail}</p>}
          {t.status_comment && <p className="mt-0.5 text-sm">&ldquo;{t.status_comment}&rdquo;</p>}
          {showEvent && <a href={`/sheets/${t.event_id}?tab=followup`} className="text-xs text-corniche hover:underline">Open sheet</a>}
        </div>
        <div className="text-right text-sm">
          <TaskChip status={t.status} />
          <p className={`mt-1 text-xs ${overdue ? "font-semibold text-st-cancelled" : "text-muted"}`}>
            Ready by {fmtDateTime(t.ready_by)}{overdue ? ", overdue" : ""}
          </p>
          {t.status === "in_progress" && t.eta && (
            <p className={`text-xs ${lateEta ? "font-semibold text-st-issue" : "text-st-progress"}`}>ETA {fmtDateTime(t.eta)}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex gap-3 text-sm">
        {editable && <button className="font-medium text-corniche hover:underline" onClick={onToggle}>{open ? "Close" : "Update status"}</button>}
        {!!t.updates.length && <button className="text-muted hover:underline" onClick={() => setShowLog(!showLog)}>{showLog ? "Hide" : "Show"} log ({t.updates.length})</button>}
      </div>

      {showLog && (
        <ol className="mt-2 space-y-1 border-l-2 border-line pl-3 text-xs">
          {t.updates.map((u, i) => (
            <li key={i}>
              <span className="text-muted">{fmtDateTime(u.created_at)}, {u.user ?? "system"}:</span> {TASK_STATUS_LABEL[u.new_status]}
              {u.eta ? `, ETA ${fmtDateTime(u.eta)}` : ""}{u.comment ? `. ${u.comment}` : ""}
            </li>
          ))}
        </ol>
      )}

      {open && editable && (
        <div className="mt-3 rounded border border-line bg-paper p-3">
          <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Status">
            {OPTIONS.map((o) => (
              <button key={o} type="button" role="radio" aria-checked={status === o} onClick={() => setStatus(o)}
                className={`rounded-full border px-3 py-1 text-sm ${status === o ? "border-corniche bg-corniche text-white" : "border-line bg-white hover:border-corniche"}`}>
                {TASK_STATUS_LABEL[o]}
              </button>
            ))}
          </div>
          {status === "in_progress" && (
            <div className="mb-3 max-w-xs">
              <label className="label" htmlFor={`eta-${t.id}`}>Estimated finish</label>
              <input id={`eta-${t.id}`} type="datetime-local" className="field" value={eta} onChange={(e) => setEta(e.target.value)} />
            </div>
          )}
          <label className="label" htmlFor={`c-${t.id}`}>Comment{NEEDS_COMMENT.includes(status) ? " (required)" : ""}</label>
          <textarea id={`c-${t.id}`} rows={2} className="field mb-3" value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder={status === "issue" ? "What is the problem and what do you need?" : status === "done" ? "Optional" : ""} />
          <Uploader eventId={t.event_id} files={files} onChange={setFiles} />
          {error && <p className="mt-2 text-sm text-st-cancelled">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" disabled={pending} onClick={save}>{pending ? "Saving..." : "Save status"}</button>
            <button className="btn-ghost" onClick={onToggle}>Close</button>
          </div>
        </div>
      )}
    </li>
  );
}
