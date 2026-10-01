"use client";
import { supabaseBrowser } from "@/lib/supabase/client";

export function SignOutButton() {
  return (
    <button
      className="rounded px-2 py-1 text-white/80 hover:bg-white/10 hover:text-white"
      onClick={async () => { await supabaseBrowser().auth.signOut(); window.location.href = "/login"; }}
    >
      Sign out
    </button>
  );
}
