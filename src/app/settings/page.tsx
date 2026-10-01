import { Shell } from "@/components/Shell";
import { requireSales, getSettings } from "@/lib/data";
import {
  addRecipient, toggleRecipient, removeRecipient, saveDepartment, saveVenue,
  saveSetupStyle, removeSetupStyle, saveGeneral, saveUser,
} from "@/app/actions/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { sb, profile } = await requireSales();
  const [settings, { data: depts }, { data: recips }, { data: venues }, { data: styles }, { data: users }] = await Promise.all([
    getSettings(sb),
    sb.from("departments").select("*").order("sort_order"),
    sb.from("recipients").select("*").order("email"),
    sb.from("venues").select("*").order("name"),
    sb.from("setup_styles").select("*").eq("active", true).order("name"),
    sb.from("profiles").select("*").order("full_name"),
  ]);
  const isAdmin = profile.role === "admin";

  return (
    <Shell active="/settings">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mb-6 text-sm text-muted">Changes apply to the next sheet that is submitted or revised.</p>

      <section className="mb-8">
        <h2 className="section-title mb-1">Email distribution</h2>
        <p className="mb-3 text-sm text-muted">
          Who receives function sheets for each department.{" "}
          {settings.routing_mode === "by_content"
            ? "Departments only receive sheets that include something for them. Sales always receives every sheet."
            : "Every listed address receives every sheet."}
        </p>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(depts ?? []).filter((d) => d.active).map((d) => {
            const list = (recips ?? []).filter((r) => r.department_code === d.code);
            return (
              <div key={d.code} className="panel p-3">
                <h3 className="mb-2 font-semibold">{d.name}</h3>
                {!list.length && <p className="mb-2 text-xs text-st-issue">Nobody receives {d.name} sheets yet.</p>}
                <ul className="mb-2 space-y-1">
                  {list.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className={r.active ? "" : "text-muted line-through"} title={r.name ?? ""}>{r.email}</span>
                      <span className="flex shrink-0 gap-2 text-xs">
                        <form action={toggleRecipient.bind(null, r.id, !r.active)}><button className="text-muted hover:text-ink">{r.active ? "Pause" : "Resume"}</button></form>
                        <form action={removeRecipient.bind(null, r.id)}><button className="text-st-cancelled hover:underline">Remove</button></form>
                      </span>
                    </li>
                  ))}
                </ul>
                <form action={addRecipient} className="flex gap-1.5">
                  <input type="hidden" name="department_code" value={d.code} />
                  <input name="email" type="email" required placeholder="name@hotel.com" aria-label={`Add email for ${d.name}`} className="field" />
                  <button className="btn-ghost shrink-0">Add</button>
                </form>
              </div>
            );
          })}
        </div>
      </section>

      <div className="mb-8 grid gap-5 lg:grid-cols-2">
        <section className="panel p-4">
          <h2 className="section-title mb-3">General</h2>
          <form action={saveGeneral} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label" htmlFor="hn">Hotel name (sheet header)</label><input id="hn" name="hotel_name" className="field" defaultValue={settings.hotel.name} /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="ft">Print footer</label><input id="ft" name="footer" className="field" defaultValue={settings.hotel.footer} /></div>
            <div><label className="label" htmlFor="vat">VAT %</label><input id="vat" name="vat_rate" type="number" step="0.01" className="field" defaultValue={settings.vat_rate} /></div>
            <div><label className="label" htmlFor="lead">Default ready-by (minutes before start)</label><input id="lead" name="lead_minutes" type="number" className="field" defaultValue={settings.lead_minutes} /></div>
            <div>
              <label className="label" htmlFor="rm">Who gets each sheet</label>
              <select id="rm" name="routing_mode" className="field" defaultValue={settings.routing_mode}>
                <option value="by_content">Only departments with requirements</option>
                <option value="all">Every department, always</option>
              </select>
            </div>
            <div><label className="label" htmlFor="feh">Feedback editable for (hours)</label><input id="feh" name="feedback_edit_hours" type="number" className="field" defaultValue={settings.feedback_edit_hours} /></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="survey_enabled" defaultChecked={settings.survey_enabled} /> Email the client a rating survey the day after the event</label>
            <div className="sm:col-span-2"><button className="btn-primary">Save settings</button></div>
          </form>
        </section>

        <section className="panel p-4">
          <h2 className="section-title mb-1">Departments</h2>
          <p className="mb-3 text-xs text-muted">The escalation contact is emailed when a task reports an issue or will finish late.</p>
          <div className="space-y-2">
            {(depts ?? []).map((d) => (
              <form key={d.code} action={saveDepartment} className="grid grid-cols-[1fr_1.4fr_56px_auto] items-center gap-1.5">
                <input type="hidden" name="code" value={d.code} />
                <input name="name" aria-label="Name" className="field" defaultValue={d.name} />
                <input name="escalation_email" type="email" aria-label="Escalation email" placeholder="Escalation email" className="field" defaultValue={d.escalation_email ?? ""} />
                <input name="sort_order" type="number" aria-label="Order" className="field" defaultValue={d.sort_order} />
                <button className="btn-ghost">Save</button>
              </form>
            ))}
            <form action={saveDepartment} className="grid grid-cols-[1fr_1.4fr_56px_auto] items-center gap-1.5 border-t border-line pt-3">
              <input name="name" required placeholder="New department" className="field" />
              <input name="code" required placeholder="code, e.g. security" className="field" />
              <input name="sort_order" type="number" defaultValue={50} className="field" />
              <button className="btn-ghost">Add</button>
            </form>
          </div>
        </section>

        <section className="panel p-4">
          <h2 className="section-title mb-3">Venues</h2>
          <div className="space-y-2">
            {(venues ?? []).map((v) => (
              <form key={v.id} action={saveVenue} className="grid grid-cols-[1fr_90px_100px_auto] items-center gap-1.5">
                <input type="hidden" name="id" value={v.id} />
                <input name="name" aria-label="Venue name" className="field" defaultValue={v.name} />
                <input name="capacity" type="number" aria-label="Capacity" placeholder="Capacity" className="field" defaultValue={v.capacity ?? ""} />
                <select name="active" aria-label="Active" className="field" defaultValue={v.active ? "on" : "off"}><option value="on">In use</option><option value="off">Hidden</option></select>
                <button className="btn-ghost">Save</button>
              </form>
            ))}
            <form action={saveVenue} className="grid grid-cols-[1fr_90px_100px_auto] items-center gap-1.5 border-t border-line pt-3">
              <input name="name" required placeholder="New venue" className="field" />
              <input name="capacity" type="number" placeholder="Capacity" className="field" />
              <span />
              <button className="btn-ghost">Add</button>
            </form>
          </div>
        </section>

        <section className="panel p-4">
          <h2 className="section-title mb-3">Setup styles</h2>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(styles ?? []).map((s) => (
              <form key={s.id} action={removeSetupStyle.bind(null, s.id)} className="inline-flex items-center gap-1 rounded-full border border-line bg-white py-0.5 pl-3 pr-1 text-sm">
                {s.name}<button aria-label={`Remove ${s.name}`} className="rounded-full px-1.5 text-muted hover:text-st-cancelled">✕</button>
              </form>
            ))}
          </div>
          <form action={saveSetupStyle} className="flex gap-1.5">
            <input name="name" required placeholder="e.g. Hollow square" className="field" />
            <button className="btn-ghost">Add</button>
          </form>
        </section>
      </div>

      {isAdmin && (
        <section className="panel p-4">
          <h2 className="section-title mb-1">Users</h2>
          <p className="mb-3 text-xs text-muted">Invite people from Supabase (Authentication, Users), then set their role and department here. Department staff only update their own department&apos;s tasks.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead><tr><th className="th">Name</th><th className="th">Email</th><th className="th">Role</th><th className="th">Department</th><th className="th" /></tr></thead>
              <tbody>
                {(users ?? []).map((u) => (
                  <tr key={u.id}>
                    <td className="td">{u.full_name}</td>
                    <td className="td text-muted">{u.email}</td>
                    <td className="td" colSpan={3}>
                      <form action={saveUser} className="grid grid-cols-[130px_1fr_auto] gap-1.5">
                        <input type="hidden" name="id" value={u.id} />
                        <select name="role" aria-label="Role" className="field" defaultValue={u.role}>
                          <option value="department">Department</option><option value="sales">Sales</option><option value="admin">Admin</option>
                        </select>
                        <select name="department_code" aria-label="Department" className="field" defaultValue={u.department_code ?? ""}>
                          <option value="">None</option>{(depts ?? []).map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
                        </select>
                        <button className="btn-ghost">Save</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </Shell>
  );
}
