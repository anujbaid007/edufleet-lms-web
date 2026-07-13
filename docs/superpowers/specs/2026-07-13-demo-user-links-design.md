# Demo User Links — Design Spec

**Date:** 2026-07-13
**Status:** Approved
**Repo:** `edufleet-lms-web` (shares Supabase project `pzmsyhohmsczevmihimr`)

---

## Overview

Let the EduFleet platform admin create **demo accounts** for potential clients. From a new **Demo** section in the admin sidebar, the admin enters a client's Name, Email, Phone, and a License Validity (1 or 2 months), and the system provisions a self-contained demo login. The demo user logs into the normal **student dashboard** but can **switch class freely** to explore any class's content, and can view a read-only **Impact Analytics** dashboard scoped only to their own demo org. When the license expires, the demo user is logged out at login time and shown *"Demo Licence Validity Expired — contact Admin."*, and the admin's demo table shows a red expiry warning.

The core insight: a demo user is just a `student` profile with an `is_demo` flag. Content, subjects, quizzes, and progress stats already flow through `getLearnerScopeManifest`, which filters by `profiles.class`. Switching class is therefore just updating `profiles.class` — the entire dashboard follows, and because `video_progress` rows point to class-specific videos, per-class stats accumulate permanently and reappear when the demo user switches back to a previously-explored class. No separate per-class store is needed.

---

## Decisions (from brainstorming)

1. **Demo scope:** Student experience **+ Impact Analytics** (read-only, locked to the demo user's own org).
2. **Housing:** Each demo client becomes its **own organization** (named after the client) with a default **"Centre A"** centre. The demo student lives under that centre.
3. **Starting stats:** **Start empty.** The student dashboard begins with zero progress and fills in as the client explores. Impact Analytics likewise reflects only live exploration (accepted trade-off: sparse until the demo user clicks around).
4. **Identity:** Profile display name is a **fixed "Student Demo"** for all demo users. Because the name is fixed, the dashboard prominently shows a **current-class badge** so the demo user always knows which class they are viewing.
5. **Who can create demos:** **`platform_admin` only** (the EduFleet admin).

---

## Scope

**In scope:**
- `is_demo` flag on `profiles`, `organizations`, `centres` (one migration).
- Admin **Demo** section: creation form + table of demo users with expiry status.
- `createDemoUser` server action (provisions org + Centre A + auth user + profile, returns credentials).
- License **extend/renew** and **deactivate/delete** actions from the demo table.
- Class switcher (demo-only) in the dashboard sidebar + current-class badge on the dashboard.
- `setDemoClass` server action (updates `profiles.class`, revalidates).
- Demo-only **Impact Analytics** page inside the dashboard shell, hard-locked to the demo's `org_id`.
- Customized expired-license message for demo accounts at login.
- **Analytics hygiene:** exclude `is_demo` orgs from real admins' org lists and platform-level Impact Analytics.

**Out of scope:**
- Independent student self-signup (that is a separate Phase 2 project).
- Board/medium switching for demo users (class only; board/medium stay at defaults).
- Mid-session forced logout on expiry (license is checked at login, per requirement). Optional layout guard noted below but not built now.
- Pre-seeding synthetic learners (explicitly rejected — start empty).
- Email delivery of credentials (admin copies + shares manually).

---

## Data Layer

### Supabase migration

New migration `supabase/migrations/<timestamp>_add_demo_support.sql`:

```sql
ALTER TABLE public.profiles       ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.organizations  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.centres        ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_demo      ON public.profiles (is_demo)      WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_organizations_is_demo ON public.organizations (is_demo) WHERE is_demo;
```

**Reused existing columns (no new columns beyond the flags):**
- `profiles.class` — the demo user's **currently selected class** (mutated on switch).
- `profiles.phone` — client's phone number.
- `profiles.license_valid_until` (date) — expiry; already resolved by the `validate_license` RPC (profile → centre → org cascade).
- `organizations.name` — client's name.
- `organizations.type` — set to a sensible default (`ngo`); demo orgs are distinguished by `is_demo`, not by type. (Avoids an enum migration.)

RLS: existing profile/org/centre policies already cover reads for the owning user and platform admin. The demo student's own org/centre are readable by them (they belong to it). No new policies required for the happy path; verify during implementation that a demo student can read their own org row for the Impact Analytics scope.

---

## Architecture

### 1. Admin — Demo section (`platform_admin` only)

**New files**

| File | Purpose |
|------|---------|
| `src/app/(admin)/admin/demo/page.tsx` | Server page: guards `platform_admin`, loads demo users, renders form + table |
| `src/components/admin/create-demo-form.tsx` | Client form: Client Name, Email, Phone, License (1/2 mo), Initial Class; shows generated credentials on success |
| `src/components/admin/demo-users-table.tsx` | Table with expiry status pill, copy-credentials, extend, deactivate/delete |
| `src/lib/actions/demo.ts` | Server actions: `createDemoUser`, `setDemoLicense`, `deactivateDemoUser`, `deleteDemoUser` |

**Modified files**

| File | Change |
|------|--------|
| `src/components/admin/admin-sidebar.tsx` | Add `{ href: "/admin/demo", label: "Demo", icon: … }` to `platformAdminLinks` |

**`createDemoUser(formData)`** (uses `createAdminClient()` service-role client, mirroring `createUser`):
1. Read `clientName`, `email`, `phone`, `licenseMonths` (`1`|`2`), `initialClass`.
2. Validate required fields; validate `initialClass` has published content.
3. Insert `organizations` row: `{ name: clientName, type: 'ngo', is_demo: true }` → `orgId`.
4. Insert `centres` row: `{ name: 'Centre A', org_id: orgId, is_demo: true, mode: 'online' }` → `centreId`.
5. Generate a random password (readable, e.g. 10–12 chars).
6. `admin.auth.admin.createUser({ email, password, email_confirm: true })`.
7. Update the auto-created profile: `{ name: 'Student Demo', role: 'student', is_demo: true, org_id, centre_id, class: initialClass, board: 'CBSE', medium: 'English', phone, license_valid_until: today + licenseMonths }`.
8. Return `{ success, email, password }` for the form to display (copyable). Password is shown once at creation only (not stored in plaintext).
9. `revalidatePath("/admin/demo")`.

Rollback: if the auth-user or profile step fails after the org/centre were created, delete the org (cascade removes the centre) so no orphan demo org lingers.

**License duration:** `license_valid_until = current_date + interval '1 month' | '2 months'`, computed in the action. No separate "months" column is stored — the table displays the **expiry date + days-remaining** directly.

**`setDemoLicense(userId, months)`** — extend/renew: set `license_valid_until = current_date + months`. Reactivates an expired demo.

**Demo users table columns:** Client (org name) · Email · Phone · Created · Expiry date · **Status pill**:
- **Red "Expired"** when `license_valid_until < today`.
- **Amber "Expiring soon"** when `0 ≤ days_remaining < 7`.
- **Green "Active"** otherwise.
Row actions: Copy credentials (email; password only available at creation), Extend (1/2 mo), Deactivate (`is_active=false`) / Delete (removes profile + auth user + org).

### 2. Demo user experience (student dashboard)

**New files**

| File | Purpose |
|------|---------|
| `src/components/dashboard/demo-class-switcher.tsx` | Client dropdown of content-bearing classes; calls `setDemoClass` |

`setDemoClass(classNum)` lives in `src/lib/actions/demo.ts` alongside the other demo actions.

**Modified files**

| File | Change |
|------|--------|
| `src/app/(dashboard)/layout.tsx` | Select `is_demo`; when demo, pass demo props to `Sidebar` and render a current-class badge |
| `src/components/dashboard/sidebar.tsx` | When `is_demo`, render `<DemoClassSwitcher>` + an "Impact Analytics" nav link |
| `src/components/dashboard/welcome-hero.tsx` (or header) | Show "Class {n}" badge for demo users |

**`setDemoClass(classNum)`**:
- Guard: caller's profile must be `is_demo` (reject otherwise — a normal student cannot change their class).
- Validate `classNum` is a content-bearing class.
- Update `profiles.class = classNum` for the current user.
- `revalidatePath("/dashboard", "layout")` so all dashboard routes re-scope.

Everything downstream — `getLearnerScopeManifest`, subjects, chapters, quizzes, progress, stats — is **unchanged** and follows the new class automatically. Per-class stats accumulate because `video_progress` persists across switches.

**Class options:** classes (0–12) that have published content for the demo's board/medium (`CBSE`/`English`). Query distinct `chapters.class` once for the switcher.

### 3. Impact Analytics for demo

**New file**

| File | Purpose |
|------|---------|
| `src/app/(dashboard)/dashboard/impact/page.tsx` | Server page: guard `is_demo`; call `loadImpactDashboard({ orgId: profile.org_id })`; render existing `ImpactDashboardClient` |

- Reuses `loadImpactDashboard` and `ImpactDashboardClient` from analytics-v2 — no new analytics logic.
- **Hard-locked to the demo user's own `org_id`** server-side; a demo user can never pass or see another org. Non-demo users hitting this route are redirected to `/dashboard`.
- Sidebar shows the "Impact Analytics" link only when `is_demo`.

### 4. Login / expiry gate (mostly existing)

**Modified file**

| File | Change |
|------|--------|
| `src/lib/actions/auth.ts` | In `login`, when `validate_license` returns invalid, return the demo-specific message if the profile is `is_demo` |

The existing flow already: calls `validate_license`, `signOut({ scope: 'local' })`, and returns an error string rendered by the login page. Change: fetch `is_demo` alongside `role`, and return `"Demo Licence Validity Expired — contact Admin."` for demo accounts (keep the generic message for everyone else).

Optional (not in this build): a lightweight `is_demo` license re-check in the dashboard layout to force logout mid-session. Deferred because the requirement is scoped to "when he tries to login."

### 5. Analytics hygiene — exclude demo orgs from real reporting

**Modified files**

| File | Change |
|------|--------|
| `src/lib/analytics-v2/server.ts` (`loadImpactDashboard`) | When no explicit `orgId` is passed (platform-level view), exclude `organizations.is_demo = true` |
| `src/app/(admin)/admin/orgs/page.tsx` and any org list feeding real admin analytics | Filter out `is_demo` orgs from real admins' lists |

This keeps demo clients out of real impact numbers. A demo user passing their own `orgId` still sees their own demo org (that path is explicit and allowed).

---

## Data Flow — class switch

```
Demo user picks Class 10 in switcher
  → setDemoClass(10)  [guard: is_demo]
  → UPDATE profiles.class = 10
  → revalidatePath("/dashboard", "layout")
  → getLearnerScopeManifest reads profiles.class = 10
  → chapters/subjects/videos for Class 10 load
  → getLearnerVideoState filters video_progress (user_id) to Class 10 videos
  → dashboard + progress show Class 10 stats only
Later: switch back to Class 5
  → profiles.class = 5; Class 5 progress rows still exist → cumulative stats reappear
```

---

## Error Handling

- **createDemoUser:** validate required fields and content-bearing class before any insert; on auth/profile failure after org/centre insert, delete the org to avoid orphans; surface Supabase error messages to the form.
- **setDemoClass:** reject non-demo callers and non-content classes; no-op if class unchanged.
- **Impact page:** redirect non-demo users; handle a demo user with a missing `org_id` gracefully (show empty state).
- **Login:** unchanged control flow; only the message string branches on `is_demo`.

---

## Testing Considerations

- Create a demo user; confirm org + Centre A + student profile created with `is_demo=true` and correct `license_valid_until`.
- Log in as the demo user; confirm student dashboard, class switcher, current-class badge, and Impact Analytics link are present (and absent for a normal student).
- Watch a video in Class 5, switch to Class 10 (empty stats), switch back to Class 5 (Class 5 stats intact) — verify cumulative per-class behavior.
- Impact Analytics shows only the demo org's data; attempting to view as a non-demo user redirects.
- Set `license_valid_until` to yesterday; confirm login logs out with the demo-specific message and the admin table shows a red "Expired" pill; extend the license and confirm login works again.
- Confirm a demo org does **not** appear in the platform-level Impact Analytics or real admin org lists.

---

## Assumptions

- The demo user's board/medium default to `CBSE`/`English`; content exists for the offered classes under those defaults.
- Password is shown to the admin once at creation (copyable) and not persisted in plaintext; renewal does not reveal the password (admin can reset via existing user edit if needed).
- "Demo" section is restricted to `platform_admin`; `org_admin`/`centre_admin` do not see it.
