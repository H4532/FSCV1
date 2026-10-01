import Link from "next/link";
import { requireUser } from "@/lib/data";
import { SignOutButton } from "./SignOutButton";

const NAV = [
  { href: "/", label: "Today", roles: ["admin", "sales", "department"] },
  { href: "/tasks", label: "My tasks", roles: ["admin", "sales", "department"] },
  { href: "/sheets/new", label: "New sheet", roles: ["admin", "sales"] },
  { href: "/history", label: "History", roles: ["admin", "sales", "department"] },
  { href: "/settings", label: "Settings", roles: ["admin", "sales"] },
];

export async function Shell({ children, active }: { children: React.ReactNode; active?: string }) {
  const { profile } = await requireUser();
  return (
    <div className="min-h-screen">
      <header className="no-print bg-corniche text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="text-[15px] font-semibold tracking-tight">Function Sheets</Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {NAV.filter((n) => n.roles.includes(profile.role)).map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded px-2.5 py-1 ${active === n.href ? "bg-white/15 font-medium" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-white/80">
            <span>{profile.full_name}{profile.department_code ? `, ${profile.department_code.replace("_", " & ")}` : ""}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
