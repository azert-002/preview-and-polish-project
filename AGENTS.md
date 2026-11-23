<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

# Beyond Words Academy
## Project rules
- Data access goes through the browser client with RLS; every app table allows only users present in `user_roles` — keeps a single-academy, staff-only model.
- Attendance rows consume package sessions through DB triggers (present or absent both count), but only once the group's teacher has a `teacher_attendance` row the same Algiers day; earlier rows stay `counted=false` and are deducted when the teacher checks in. Never change sessions in app code.
- Pricing/payroll rules live in `src/lib/business.ts` with tests in `business.test.ts`; multi-month packages are stored as 8-session blocks so payroll pays per completed block.
- All UI strings come from the bilingual dictionary in `src/lib/i18n.tsx`; language is saved in localStorage and drives `dir`/`lang` on `<html>`.
- Printing uses `PrintDialog` (portal into `.print-root`, isolated by print CSS in `styles.css`).
- Backups are JSON exports of all tables (`src/lib/backup.ts`), validated before restore.
- Notifications are centralized in `src/components/Notifications.tsx` (centered sonner toasts, global form-validation notices replacing native browser bubbles, `ConfirmHost`); ask for confirmation with `confirmAction()` from `src/lib/confirm.ts`, never `window.confirm`, and report failures with `notifyError()` from `src/lib/errors.ts` — keeps every message centered, styled and bilingual.
- Student debts/credit come only from `studentLedger()` in `src/lib/business.ts` (packages = enrollment blocks sharing group + created_at; payments without a live package and overpayments become credit applied oldest-first); never sum prices minus payments ad hoc — keeps every page showing the same figures.
- Debt payments go through `PayDebtDialog` (amount capped at the package's remaining debt via `validatePayment`) and are linked to the package's first block.
- Timetable rules (what meets on a date, current/next session, Saturday-first week) live in `src/lib/schedule.ts` with tests in `schedule.test.ts`; pages never compute session timing ad hoc — keeps live panels and the weekly grid consistent.
- Strings about one specific teacher use `tg(key, teacher.gender)` from `useI18n()` (female Arabic overrides in `FEMALE_AR`), and printouts take a `female`/`teacherFemale` flag — never hardcode the masculine form for a named teacher.
- Permissions: two roles (admin = director, staff = secretary); what each may see lives in `src/lib/permissions.ts` (tested in `permissions.test.ts`) and drives the nav, page blocking in `AppShell` and dashboard cards; money tables (expenses, payouts) are admin-only in RLS too. Staff accounts are managed only through the admin-checked browser functions in `src/lib/users.ts` (tested in `users.test.ts`), because the data lives in the browser's offline store that no server can reach.
- Sign-in is username + password only; public signup and Google stay off. The director account is built in (credentials in `director-setup.ts`): the offline store seeds it on first run, and the built-in credentials only bypass the stored password while no admin role exists, so every fresh copy works without registration but a changed director password cannot be skipped. Afterwards only the director creates accounts. Usernames map to private emails via `username.ts`, and typed passwords go through `authPassword()` (pads ones under 6 chars) everywhere they reach Auth; no email flows exist. Users change their own password through `changeMyPassword`.
- Group capacity, age categories and waiting-list readiness live in `src/lib/business.ts` (`groupSeat`, `studentAgeGroup`, `waitlistBuckets`, tested in `capacity.test.ts`); students store a chosen `age_group` (birth date is deprecated, read only as fallback via `studentAgeGroup`); a group's pricing `audience` is derived from its `age_group` on save, and enrolling removes the student's matching waiting-list entries — keeps capacity checks and alerts identical on every page.
- Data is offline-first: `@/integrations/supabase/client` is a Supabase-shaped facade over IndexedDB (`src/lib/local-db/`); never add server functions that read app data, since the server cannot see the browser store.
