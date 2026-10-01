"use client";
import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface Uploaded { path: string; name: string; mime: string; size: number; caption: string }

const MAX = 250 * 1024 * 1024;

/** Uploads photos, videos and documents to the private "materials" bucket. Opens the camera on phones. */
export function Uploader({ eventId, files, onChange }: { eventId: string; files: Uploaded[]; onChange: (f: Uploaded[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setError("");
    const sb = supabaseBrowser();
    const out: Uploaded[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX) { setError(`${f.name} is larger than 250 MB.`); continue; }
      const path = `${eventId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error } = await sb.storage.from("materials").upload(path, f, { contentType: f.type, upsert: false });
      if (error) { setError(`${f.name}: ${error.message}`); continue; }
      out.push({ path, name: f.name, mime: f.type, size: f.size, caption: "" });
    }
    onChange([...files, ...out]);
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Uploading..." : "Attach photos, videos or files"}
        </button>
        <input ref={input} type="file" multiple className="hidden" accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
          onChange={(e) => pick(e.target.files)} />
        {files.map((f, i) => (
          <span key={f.path} className="inline-flex items-center gap-1 rounded border border-line bg-paper px-2 py-0.5 text-xs">
            {f.name}
            <button type="button" aria-label={`Remove ${f.name}`} className="text-muted hover:text-st-cancelled" onClick={() => onChange(files.filter((_, j) => j !== i))}>✕</button>
          </span>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-st-cancelled">{error}</p>}
    </div>
  );
}
