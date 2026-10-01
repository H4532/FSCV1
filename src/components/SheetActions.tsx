"use client";
import Link from "next/link";
import { useTransition } from "react";
import { acknowledgeSheet, deleteDraft, setSheetStatus } from "@/app/actions/sheets";
import { sendSurvey } from "@/app/actions/feedback";

export function SheetActions({
  id, status, role, acknowledged, hasDept, hasContactEmail, surveySent,
}: {
  id: string; status: string; role: string; acknowledged: boolean; hasDept: boolean; hasContactEmail: boolean; surveySent: boolean;
}) {
  const [pending, start] = useTransition();
  const sales = role === "admin" || role === "sales";
  const run = (fn: () => Promise<unknown>) =>
    start(async () => { try { await fn(); } catch (e) { alert((e as Error).message); } });
  const closed = status === "completed" || status === "cancelled";

  return (
    <div className="no-print flex flex-wrap gap-2">
      <Link href={`/sheets/${id}/print`} className="btn-ghost">Print</Link>
      {hasDept && status !== "draft" && !closed && (
        acknowledged
          ? <span className="btn border border-st-done/40 text-st-done">Acknowledged</span>
          : <button className="btn-primary" disabled={pending} onClick={() => run(() => acknowledgeSheet(id))}>Acknowledge</button>
      )}
      {sales && !closed && <Link href={`/sheets/${id}/edit`} className="btn-ghost">Edit</Link>}
      {sales && <Link href={`/sheets/new?from=${id}`} className="btn-ghost">Duplicate</Link>}
      {sales && status === "submitted" && (
        <button className="btn-ghost" disabled={pending} onClick={() => run(() => setSheetStatus(id, "confirmed"))}>Mark confirmed</button>
      )}
      {sales && ["submitted", "confirmed"].includes(status) && (
        <button className="btn-ghost" disabled={pending} onClick={() => run(() => setSheetStatus(id, "completed"))}>Mark completed</button>
      )}
      {sales && status === "completed" && hasContactEmail && (
        <button className="btn-ghost" disabled={pending} onClick={() => run(() => sendSurvey(id))}>{surveySent ? "Resend client survey" : "Send client survey"}</button>
      )}
      {sales && !closed && status !== "draft" && (
        <button className="btn-danger" disabled={pending} onClick={() => {
          const reason = prompt("Cancellation reason (sent to all departments):");
          if (reason?.trim()) run(() => setSheetStatus(id, "cancelled", reason));
        }}>Cancel event</button>
      )}
      {sales && status === "draft" && (
        <button className="btn-danger" disabled={pending} onClick={() => confirm("Delete this draft?") && run(() => deleteDraft(id))}>Delete draft</button>
      )}
      {role === "admin" && closed && (
        <button className="btn-ghost" disabled={pending} onClick={() => run(() => setSheetStatus(id, "submitted"))}>Reopen</button>
      )}
    </div>
  );
}
