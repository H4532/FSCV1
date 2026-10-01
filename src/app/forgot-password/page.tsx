"use client";
import Link from "next/link";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    const origin = window.location.origin;
    const redirectTo = `${origin}/auth/callback?next=/reset-password`;
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, { redirectTo });

    setBusy(false);
    if (error) return setError(error.message);
    setMessage("Password reset email sent. Check your inbox and open the recovery link.");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-corniche px-4">
      <form onSubmit={sendReset} className="w-full max-w-sm rounded-md bg-white p-6 shadow-xl">
        <h1 className="text-xl font-semibold">Reset password</h1>
        <p className="mb-5 text-sm text-muted">Enter your account email and we will send a recovery link.</p>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" type="email" required className="field mb-4" value={email} onChange={(e) => setEmail(e.target.value)} />
        {error && <p className="mb-3 text-sm text-st-cancelled">{error}</p>}
        {message && <p className="mb-3 text-sm">{message}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Sending..." : "Send recovery email"}</button>
        <p className="mt-4 text-center text-sm"><Link className="underline" href="/login">Back to sign in</Link></p>
      </form>
    </div>
  );
}
