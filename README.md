# FSCV1 - Function Sheet Control

Web system that replaces the Excel + Outlook function sheet process for hotel events.

Sales fill in a function sheet and submit it. The right departments get an email with a link. Each department confirms its own tasks (Done, In progress with ETA, Issue, N/A, Cancelled). Changes go out as numbered revisions showing exactly what changed. After the event, everyone records feedback, incidents, photos and videos. Every sheet stays searchable in History.

## Features

| Module | What it does |
|---|---|
| **Function sheet** | Multi-day events (one row per date), venue dropdown with capacity and double-booking check, setup style, F&B items per day, department requirements with "No requirements" tick, automatic VAT and balance, validation before submit |
| **Revisions** | Every submit or edit after submission is a full snapshot (Rev 1, Rev 2...). The email and the sheet show what changed, e.g. "Fri 2 Oct pax: 35 -> 40". Any old revision can be printed exactly as it was sent |
| **Follow-up** | Tasks generated per department per day: Banquet setup, F&B service, Kitchen prep, department notes, Accounts payment check. Statuses: Pending, In progress (ETA required), Done, Issue (comment required), N/A (reason required), Cancelled (comment required). Photo proof can be attached. On a revision, only tasks whose requirement changed reset to Pending, marked "Changed in Rev N" |
| **Alerts** | Issue reported or ETA later than deadline: Sales + department escalation contact get an email. Overdue tasks are flagged by the cron job. Sales gets "Event ready" when all tasks are done, and a reminder if a draft is still unsent 48h before the event |
| **Today board** | Readiness bar per event and per department for today and tomorrow, with overdue and issue counts |
| **Feedback & materials** | Remarks, incidents (category, severity, resolved) and client feedback with rating. Photos, videos, PDFs and Office files go to private storage, max 250 MB each. Edit window configurable (default 24h) |
| **Client survey** | Emailed automatically the day after the event (optional). The client rates venue, food, service and value without logging in, and the result lands in Feedback |
| **History** | Search and filters (dates, status, venue, sales, payment due, open incidents, low rating), per-account view with revenue and average pax, CSV export for Excel (Arabic-safe), Duplicate for repeat clients with a "Last time" banner showing previous remarks |
| **Settings** | Email recipients per department (add, pause, remove), routing mode, departments and escalation contacts, venues and capacity, setup styles, VAT %, default lead time, users and roles |
| **Print** | A4 layout matching the current hotel sheet, with revision number, printed-on time and a QR code to the live version |

Roles: **Admin** (everything, including user roles and reopening closed sheets), **Sales** (sheets and settings), **Department** (acknowledges sheets and updates its own department's tasks, adds feedback). Security is enforced in the database with row-level security, not only in the UI.

## Stack

Next.js 14 (App Router, server actions), TypeScript, Tailwind. Supabase for Postgres, Auth, Storage and row-level security. Email goes through Microsoft 365 Graph, so it is sent from the hotel's own mailbox.

## Setup

### 1. Supabase
1. Create a project at supabase.com. The Frankfurt (eu-central-1) region is closest to KSA among the standard regions.
2. In **SQL Editor**, run `supabase/migrations/0001_schema.sql`, then `0002_seed.sql`. Alternatively, with the Supabase CLI: `supabase link` then `supabase db push`.
3. In **Authentication > Users**, invite yourself. Then make yourself admin in the SQL Editor:
   ```sql
   update profiles set role = 'admin', department_code = 'sales' where email = 'you@hotel.com';
   ```
4. Invite the other users. Set their role and department in the app under **Settings > Users**.

### 2. Microsoft 365 email (Graph)
1. Go to **Azure portal > App registrations > New registration**.
2. Under **API permissions**, add **Microsoft Graph > Application > Mail.Send**, then grant admin consent.
3. Under **Certificates & secrets**, create a client secret.
4. Recommended: limit the app to the sender mailbox only, in Exchange Online PowerShell:
   ```powershell
   New-ApplicationAccessPolicy -AppId <client-id> -PolicyScopeGroupId events@yourhotel.com -AccessRight RestrictAccess -Description "FSCV1 sender only"
   ```
5. Set `MAIL_PROVIDER=graph` and the `GRAPH_*` variables. With `MAIL_PROVIDER=console`, emails are only logged, which is useful for testing. Every send attempt appears in the sheet's **Revisions & log** tab.

### 3. Run locally
```bash
cp .env.example .env.local   # fill in Supabase keys and email settings
npm install
npm run dev                  # http://localhost:3000
npm test                     # business logic tests
```

### 4. Deploy
- **Vercel:** import the GitHub repo and add the environment variables. `vercel.json` schedules `/api/cron/alerts` every 15 minutes. Vercel sends `CRON_SECRET` automatically, but the Hobby plan only allows daily crons.
- **On-premise / hotel server:** run `npm run build && npm start` behind IIS or Nginx, under pm2 or as a Windows service. Schedule the alerts every 15 minutes:
  ```
  curl -H "Authorization: Bearer <CRON_SECRET>" https://fs.yourhotel.com/api/cron/alerts
  ```

## Push to GitHub (repo FSCV1)
```bash
cd FSCV1
git remote add origin https://github.com/<your-account>/FSCV1.git
git branch -M main
git push -u origin main
```

## Project structure
```
supabase/migrations/   0001_schema.sql (tables, RLS, storage), 0002_seed.sql (departments, venues, sample UAE FA sheet)
src/app/               pages: / (today), sheets/new, sheets/[id] (+edit, print), tasks, history (+export), settings, survey/[token], api/cron/alerts
src/app/actions/       server actions: sheets (save, revise, status), tasks, feedback/survey, settings
src/components/        SheetForm, SheetDocument (print layout), FollowUp, Feedback, Uploader, Status chips and readiness bar
src/lib/               tasks.ts (task generation), diff.ts (revision changes), calc.ts (VAT), emails.ts, mail.ts (Graph), time.ts (Asia/Riyadh)
tests/                 logic.test.ts
```

## How a sheet flows
1. **Draft:** Sales saves it. Nothing is sent yet.
2. **Submit:** validation runs (contact details present, a meal mentioned in the description must be listed under F&B, every department filled in or ticked "No requirements", no venue clash). Then Rev 1 is snapshotted, tasks are created, and departments are emailed.
3. **Edit:** a new revision is created only if something changed. The email lists the changes, affected tasks reset to Pending, and removed items become Cancelled.
4. **Follow-up:** departments acknowledge the sheet and update their tasks. Sales watches the readiness bar.
5. **Completed:** set by Sales, or automatically after the last event day. The client survey goes out, and feedback, incidents and materials are recorded.
6. **Cancelled:** requires a reason. All departments are emailed and open tasks are cancelled. Cancelled sheets are never deleted, only drafts can be.

## Roadmap ideas
PDF attachment on the email, Arabic interface (RTL), WhatsApp alerts, client confirmation portal with e-signature, equipment inventory booking, ZATCA e-invoice hand-off, PMS (Opera) group block link, monthly revenue and on-time dashboards.
