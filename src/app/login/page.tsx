"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError("Email or password is incorrect.");
    const next = new URLSearchParams(window.location.search).get("next") || "/";
    window.location.href = next;
  }

  return (
    <div className="grid min-h-screen place-items-center bg-corniche px-4">
      <form onSubmit={signIn} className="w-full max-w-sm rounded-md bg-white p-6 shadow-xl">
        <h1 className="text-xl font-semibold">Function Sheets</h1>
        <p className="mb-5 text-sm text-muted">Sign in with your hotel account.</p>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" type="email" required className="field mb-3" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="label" htmlFor="pw">Password</label>
        <input id="pw" type="password" required className="field mb-4" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="mb-3 text-sm text-st-cancelled">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
        <p className="mt-4 text-xs text-muted">No account? Ask the IT or Sales admin to invite you.</p>
      </form>
    </div>
  );
}
