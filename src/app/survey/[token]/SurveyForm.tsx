"use client";
import { useState, useTransition } from "react";
import { submitSurvey } from "@/app/actions/feedback";

const ASPECTS = [["venue", "Meeting room"], ["food", "Food & drinks"], ["service", "Service"], ["value", "Value for money"]] as const;

export function SurveyForm({ token }: { token: string }) {
  const [r, setR] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [done, setDone] = useState("");
  const [pending, start] = useTransition();
  if (done) return <p>{done}</p>;
  return (
    <div>
      {ASPECTS.map(([k, label]) => (
        <fieldset key={k} className="mb-4">
          <legend className="mb-1 text-sm font-medium">{label}</legend>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-label={`${label} ${n} of 5`} onClick={() => setR({ ...r, [k]: n })}
                className={`h-10 w-10 rounded border text-sm ${r[k] && n <= r[k] ? "border-corniche bg-corniche text-white" : "border-line"}`}>{n}</button>
            ))}
          </div>
        </fieldset>
      ))}
      <label className="label" htmlFor="sc">Anything we should know?</label>
      <textarea id="sc" rows={3} className="field mb-4" value={comment} onChange={(e) => setComment(e.target.value)} />
      <button className="btn-primary w-full" disabled={pending || !Object.keys(r).length}
        onClick={() => start(async () => { const x = await submitSurvey(token, r, comment); setDone(x.ok ? "Thank you, your feedback has been received." : x.error ?? "Something went wrong."); })}>
        Send feedback
      </button>
    </div>
  );
}
