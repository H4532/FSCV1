"use client";
import { useState, useTransition } from "react";
import { addFeedback, editFeedback, signedUrl, toggleResolved } from "@/app/actions/feedback";
import { Uploader, type Uploaded } from "./Uploader";
import { fmtDateTime } from "@/lib/time";

export interface FeedbackRow {
  id: string; type: "remark" | "incident" | "client"; department_code: string | null; category: string | null; text: string;
  rating: number | null; severity: string | null; resolved: boolean; author_name: string | null; author_id: string | null; created_at: string;
  attachments: { id: string; file_path: string; file_name: string; mime_type: string | null; caption: string | null; url: string | null }[];
}

const CATEGORIES = ["F&B", "AV / IT", "Setup", "Cleanliness", "Billing", "Safety", "Staff", "Other"];
const TYPE_LABEL = { remark: "Remark", incident: "Incident", client: "Client feedback" };

export function Feedback({
  eventId, rows, departments, myDept, myId, isAdmin, editHours, unlinked,
}: {
  eventId: string; rows: FeedbackRow[]; departments: Record<string, string>; myDept: string | null; myId: string;
  isAdmin: boolean; editHours: number;
  unlinked: FeedbackRow["attachments"]; // files attached to task updates
}) {
  const [type, setType] = useState<FeedbackRow["type"]>("remark");
  const [dept, setDept] = useState(myDept ?? "sales");
  const [category, setCategory] = useState("");
  const [text, setText] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [severity, setSeverity] = useState<"low" | "medium" | "high" | null>(null);
  const [files, setFiles] = useState<Uploaded[]>([]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<"all" | FeedbackRow["type"]>("all");

  function submit() {
    setError("");
    start(async () => {
      const r = await addFeedback({ eventId, type, department_code: dept, category, text, rating, severity, attachments: files });
      if (!r.ok) return setError(r.error ?? "Could not save.");
      setText(""); setFiles([]); setRating(null); setSeverity(null); setCategory("");
    });
  }

  const shown = rows.filter((r) => filter === "all" || r.type === filter);
  const allFiles = [...rows.flatMap((r) => r.attachments), ...unlinked];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5 text-sm">
          {(["all", "remark", "incident", "client"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 ${filter === f ? "border-corniche bg-corniche text-white" : "border-line bg-white"}`}>
              {f === "all" ? `All (${rows.length})` : `${TYPE_LABEL[f]} (${rows.filter((r) => r.type === f).length})`}
            </button>
          ))}
        </div>
        {!shown.length && <p className="panel p-6 text-sm text-muted">No feedback yet. Add remarks, incidents or photos from the event.</p>}
        {shown.map((r) => (
          <FeedbackItem key={r.id} r={r} departments={departments}
            canEdit={isAdmin || (r.author_id === myId && Date.now() - new Date(r.created_at).getTime() < editHours * 3600000)} />
        ))}
      </div>

      <aside className="space-y-5">
        <div className="panel p-4">
          <h3 className="section-title mb-3">Add feedback</h3>
          <div className="mb-3 grid grid-cols-3 gap-1 rounded border border-line p-1 text-sm">
            {(["remark", "incident", "client"] as const).map((t) => (
              <button key={t} onClick={() => setType(t)} className={`rounded py-1 ${type === t ? "bg-corniche text-white" : "hover:bg-paper"}`}>{TYPE_LABEL[t].split(" ")[0]}</button>
            ))}
          </div>
          <label className="label" htmlFor="fb-dept">Department</label>
          <select id="fb-dept" className="field mb-3" value={dept} onChange={(e) => setDept(e.target.value)}>
            {Object.entries(departments).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
          {type === "incident" && (
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="fb-cat">Category</label>
                <select id="fb-cat" className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Choose</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="fb-sev">Severity</label>
                <select id="fb-sev" className="field" value={severity ?? ""} onChange={(e) => setSeverity((e.target.value || null) as typeof severity)}>
                  <option value="">Choose</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                </select>
              </div>
            </div>
          )}
          {type === "client" && (
            <div className="mb-3">
              <p className="label">Client satisfaction</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" aria-label={`${n} of 5`} onClick={() => setRating(n)}
                    className={`h-8 w-8 rounded border text-sm ${rating && n <= rating ? "border-corniche bg-corniche text-white" : "border-line bg-white"}`}>{n}</button>
                ))}
              </div>
            </div>
          )}
          <label className="label" htmlFor="fb-text">{type === "incident" ? "What happened" : "Remark"}</label>
          <textarea id="fb-text" rows={4} className="field mb-3" value={text} onChange={(e) => setText(e.target.value)} />
          <Uploader eventId={eventId} files={files} onChange={setFiles} />
          {error && <p className="mt-2 text-sm text-st-cancelled">{error}</p>}
          <button className="btn-primary mt-3 w-full" disabled={pending} onClick={submit}>{pending ? "Saving..." : "Add feedback"}</button>
        </div>

        <div className="panel p-4">
          <h3 className="section-title mb-3">Materials ({allFiles.length})</h3>
          {!allFiles.length && <p className="text-sm text-muted">Photos, videos and documents from remarks and task updates appear here.</p>}
          <div className="grid grid-cols-3 gap-2">{allFiles.map((a) => <Thumb key={a.id} a={a} />)}</div>
        </div>
      </aside>
    </div>
  );
}

function FeedbackItem({ r, departments, canEdit }: { r: FeedbackRow; departments: Record<string, string>; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(r.text);
  const [pending, start] = useTransition();
  const tone = r.type === "incident" ? (r.resolved ? "border-l-st-done" : "border-l-st-issue") : r.type === "client" ? "border-l-st-progress" : "border-l-line";
  return (
    <article className={`panel border-l-4 ${tone} p-4`}>
      <header className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">
          {TYPE_LABEL[r.type]}{r.department_code ? `, ${departments[r.department_code] ?? r.department_code}` : ""}
          {r.category && <span className="font-normal text-muted">, {r.category}</span>}
          {r.severity && <span className={`ml-2 rounded px-1.5 text-xs ${r.severity === "high" ? "bg-st-cancelled text-white" : "bg-st-issue/15 text-st-issue"}`}>{r.severity}</span>}
          {r.rating && <span className="ml-2 text-st-progress">{r.rating}/5</span>}
        </span>
        <span className="text-xs text-muted">{r.author_name ?? "Client"}, {fmtDateTime(r.created_at)}</span>
      </header>
      {editing ? (
        <div>
          <textarea className="field mb-2" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn-primary" disabled={pending} onClick={() => start(async () => { const x = await editFeedback(r.id, text); if (!x.ok) alert(x.error); else setEditing(false); })}>Save</button>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm">{r.text}</p>
      )}
      {!!r.attachments.length && <div className="mt-2 grid grid-cols-4 gap-2 md:grid-cols-6">{r.attachments.map((a) => <Thumb key={a.id} a={a} />)}</div>}
      <footer className="mt-2 flex gap-3 text-xs">
        {canEdit && !editing && <button className="text-corniche hover:underline" onClick={() => setEditing(true)}>Edit</button>}
        {r.type === "incident" && (
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={r.resolved} disabled={pending} onChange={(e) => start(() => toggleResolved(r.id, e.target.checked))} /> Resolved
          </label>
        )}
      </footer>
    </article>
  );
}

function Thumb({ a }: { a: FeedbackRow["attachments"][number] }) {
  const isImg = a.mime_type?.startsWith("image/");
  const isVid = a.mime_type?.startsWith("video/");
  async function open() {
    const u = (await signedUrl(a.file_path)) ?? a.url; // fresh link in case the page has been open a while
    if (u) window.open(u, "_blank");
  }
  return (
    <button type="button" onClick={open} title={a.caption ?? a.file_name}
      className="relative aspect-square overflow-hidden rounded border border-line bg-paper text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-corniche">
      {isImg && a.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.url} alt={a.caption ?? a.file_name} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full flex-col items-center justify-center p-1 text-center text-[10px] leading-tight text-muted">
          <span className="mb-1 text-lg">{isVid ? "▶" : isImg ? "🖼" : "📄"}</span>
          <span className="line-clamp-2 break-all">{a.file_name}</span>
        </span>
      )}
    </button>
  );
}
