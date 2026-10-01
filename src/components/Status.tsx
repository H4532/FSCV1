import type { SheetStatus, TaskStatus } from "@/lib/types";
import { SHEET_STATUS_LABEL, TASK_STATUS_LABEL } from "@/lib/types";

const TASK_STYLE: Record<TaskStatus, string> = {
  pending: "bg-st-pending/15 text-ink border-st-pending/50",
  in_progress: "bg-st-progress/10 text-st-progress border-st-progress/40",
  done: "bg-st-done/10 text-st-done border-st-done/40",
  issue: "bg-st-issue/10 text-st-issue border-st-issue/50",
  na: "bg-st-na/10 text-st-na border-st-na/30",
  cancelled: "bg-st-cancelled/10 text-st-cancelled border-st-cancelled/40 line-through",
};
const DOT: Record<TaskStatus, string> = {
  pending: "bg-st-pending", in_progress: "bg-st-progress", done: "bg-st-done",
  issue: "bg-st-issue", na: "bg-st-na", cancelled: "bg-st-cancelled",
};

export function TaskChip({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${TASK_STYLE[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} />
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}

const SHEET_STYLE: Record<SheetStatus, string> = {
  draft: "border-dashed border-muted text-muted",
  submitted: "border-st-progress/50 text-st-progress",
  confirmed: "border-corniche/60 text-corniche",
  completed: "border-st-done/50 text-st-done",
  cancelled: "border-st-cancelled/50 text-st-cancelled",
};
export function SheetChip({ status }: { status: SheetStatus }) {
  return <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${SHEET_STYLE[status]}`}>{SHEET_STATUS_LABEL[status]}</span>;
}

/** Segmented readiness bar: one segment per task, coloured by status. The signature element of the app. */
export function ReadinessBar({ statuses, overdue = 0 }: { statuses: TaskStatus[]; overdue?: number }) {
  const counted = statuses.filter((s) => s !== "na" && s !== "cancelled");
  const done = counted.filter((s) => s === "done").length;
  const pct = counted.length ? Math.round((done / counted.length) * 100) : 100;
  const order: TaskStatus[] = ["done", "in_progress", "issue", "pending"];
  const sorted = [...counted].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-2.5 flex-1 gap-[2px] overflow-hidden rounded-sm" role="img" aria-label={`${pct}% ready`}>
        {sorted.length ? sorted.map((s, i) => <span key={i} className={`flex-1 ${DOT[s]}`} />) : <span className="flex-1 bg-st-done/40" />}
      </div>
      <span className={`w-10 text-right text-xs font-semibold ${overdue ? "text-st-cancelled" : pct === 100 ? "text-st-done" : "text-ink"}`}>{pct}%</span>
    </div>
  );
}
