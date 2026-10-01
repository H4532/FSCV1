"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    setBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    setBusy(false);

    if (error) return setError(error.message);
    window.location.href = "/";
  }

  return (
    <div className="grid min-h-screen place-items-center bg-corniche px-4">
      <form onSubmit={updatePassword} className="w-full max-w-sm rounded-md bg-white p-6 shadow-xl">
        <h1 className="text-xl font-semibold">Choose a new password</h1>
        <p className="mb-5 text-sm text-muted">Set a new password for your Function Sheets account.</p>
        <label className="label" htmlFor="pw">New password</label>
        <input id="pw" type="password" minLength={8} required className="field mb-3" value={password} onChange={(e) => setPassword(e.target.value)} />
        <label className="label" htmlFor="confirm">Confirm password</label>
        <input id="confirm" type="password" minLength={8} required className="field mb-4" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && <p className="mb-3 text-sm text-st-cancelled">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Updating..." : "Update password"}</button>
      </form>
    </div>
  );
}
