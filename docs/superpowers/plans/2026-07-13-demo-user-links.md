# Demo User Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the EduFleet platform admin create demo accounts for prospective clients — a Demo section in the admin panel provisions a per-client org + student login that can switch class, see per-class cumulative stats, and view an org-locked Impact Analytics dashboard; the login expires after 1 or 2 months.

**Architecture:** A demo user is a normal `student` profile flagged `is_demo`. Switching class updates `profiles.class`, so the existing `getLearnerScopeManifest` pipeline re-scopes all content and stats automatically; `video_progress` persistence gives per-class cumulative stats for free. Each client gets its own `organizations` row (client name) + a "Centre A" `centres` row, both `is_demo`. Impact Analytics reuses `loadImpactDashboard` but through a hardened, caller-scoped server action.

**Tech Stack:** Next.js 14 (App Router, server actions), Supabase (SSR anon client for session reads, service-role `createAdminClient` for privileged writes/analytics), TypeScript, Tailwind + clay UI components.

## Global Constraints

- **Repo:** `edufleet-lms-web` only. Supabase project `pzmsyhohmsczevmihimr`.
- **No unit-test runner exists.** Verify each task with `npx tsc --noEmit`, `npm run lint`, and the explicit manual/DB checks in the task. Do not invent a test framework.
- **Privileged DB writes and analytics reads use `createAdminClient()`** (service role) exactly like `src/lib/actions/admin.ts`. Session/identity reads use `createClient()` from `src/lib/supabase/server`.
- **Demo profile display name is the fixed string `"Student Demo"`** for every demo user.
- **Demo defaults:** `board = "CBSE"`, `medium = "English"`, `role = "student"`, org `type = "ngo"`, centre name `"Centre A"`.
- **Demo section is `platform_admin` only.**
- **Exact expired-login message for demo accounts:** `"Demo Licence Validity Expired - contact Admin"`.
- **Commit after every task.** Commit only the files listed in the task (the repo has unrelated uncommitted `scripts/pendrive/*` changes — never stage those). End commit messages with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Follow existing patterns: `ClayCard`, `ClayInput`, `ClayButton`, the `clay-input` CSS class for `<select>`/`<input type=date>`, `cn()` from `@/lib/utils`, lucide-react icons.

---

## File Structure

**New files**
| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260713000000_add_demo_support.sql` | Add `is_demo` to profiles/organizations/centres + indexes |
| `src/lib/actions/demo.ts` | All demo server actions: `createDemoUser`, `setDemoLicense`, `deactivateDemoUser`, `deleteDemoUser`, `setDemoClass`; helpers `generateDemoPassword`, `getDemoClassOptions` |
| `src/components/admin/create-demo-form.tsx` | Admin form to create a demo user; shows generated credentials |
| `src/components/admin/demo-users-table.tsx` | Table of demo users with expiry status + row actions |
| `src/app/(admin)/admin/demo/page.tsx` | Admin Demo page (guard platform_admin, load list, render form + table) |
| `src/components/dashboard/demo-class-switcher.tsx` | Sidebar class dropdown for demo users |
| `src/app/(dashboard)/dashboard/impact/page.tsx` | Demo-only Impact Analytics page, org-locked |

**Modified files**
| File | Change |
|------|--------|
| `src/lib/supabase/types.ts` | Add `is_demo` to profiles/organizations/centres Row/Insert/Update types |
| `src/components/admin/admin-sidebar.tsx` | Add "Demo" nav item for `platform_admin` |
| `src/components/dashboard/sidebar.tsx` | For demo users: render class switcher + "Impact Analytics" link |
| `src/app/(dashboard)/layout.tsx` | Select `is_demo`; pass demo props to `Sidebar` |
| `src/lib/analytics-v2/server.ts` | Add `includeDemo` option + demo exclusion; harden `loadImpactDashboardAction` with caller scoping |
| `src/lib/actions/auth.ts` | Demo-specific expired-license message |

---

## Task 1: Migration — `is_demo` flags + types

**Files:**
- Create: `supabase/migrations/20260713000000_add_demo_support.sql`
- Modify: `src/lib/supabase/types.ts`
- Verify script (temporary): `scripts/verify-demo-migration.ts`

**Interfaces:**
- Produces: `profiles.is_demo`, `organizations.is_demo`, `centres.is_demo` (all `boolean not null default false`), available in Supabase types so later tasks compile.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260713000000_add_demo_support.sql`:

```sql
-- Demo accounts: mark demo profiles and their dedicated org/centre.
ALTER TABLE public.profiles      ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.centres       ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_demo      ON public.profiles (is_demo)      WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_organizations_is_demo ON public.organizations (is_demo) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_centres_is_demo       ON public.centres (is_demo)       WHERE is_demo;

COMMENT ON COLUMN public.profiles.is_demo      IS 'True for demo/prospect accounts created from the admin Demo section.';
COMMENT ON COLUMN public.organizations.is_demo IS 'True for per-client demo organizations; excluded from real Impact Analytics.';
COMMENT ON COLUMN public.centres.is_demo       IS 'True for demo centres (e.g. "Centre A") under a demo organization.';
```

- [ ] **Step 2: Apply the migration to Supabase**

Preferred: `npx supabase db push` (project is linked; ref `pzmsyhohmsczevmihimr`). If it prompts for the DB password and it is unavailable, fall back: open the Supabase SQL editor for the project and run the SQL from Step 1 verbatim.

Run: `cd /Users/anuj/Desktop/Projects/edufleet-lms-web && npx supabase db push`
Expected: reports the new migration applied (or "no changes" if already applied). If auth fails, use the SQL editor fallback, then continue.

- [ ] **Step 3: Write a verification script**

Create `scripts/verify-demo-migration.ts`:

```ts
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  for (const table of ["profiles", "organizations", "centres"]) {
    const { error } = await supabase.from(table).select("is_demo").limit(1);
    if (error) {
      console.error(`FAIL ${table}.is_demo:`, error.message);
      process.exit(1);
    }
    console.log(`OK   ${table}.is_demo present`);
  }
  console.log("Migration verified.");
}
main();
```

- [ ] **Step 4: Run the verification script**

Run: `cd /Users/anuj/Desktop/Projects/edufleet-lms-web && npx tsx scripts/verify-demo-migration.ts`
Expected: three `OK ... is_demo present` lines then `Migration verified.` (No "column ... does not exist" errors.)

- [ ] **Step 5: Regenerate Supabase types**

Run: `cd /Users/anuj/Desktop/Projects/edufleet-lms-web && npm run gen:types`
Expected: `src/lib/supabase/types.ts` updated with `is_demo`.

If `gen:types` fails (CLI auth), manually edit `src/lib/supabase/types.ts`: in the `profiles`, `organizations`, and `centres` definitions add `is_demo: boolean` to the `Row` object, and `is_demo?: boolean` to both `Insert` and `Update` objects.

- [ ] **Step 6: Typecheck**

Run: `cd /Users/anuj/Desktop/Projects/edufleet-lms-web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Delete the verification script and commit**

```bash
cd /Users/anuj/Desktop/Projects/edufleet-lms-web
rm scripts/verify-demo-migration.ts
git add supabase/migrations/20260713000000_add_demo_support.sql src/lib/supabase/types.ts
git commit -m "feat: add is_demo flag to profiles, organizations, centres

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Demo server actions (`src/lib/actions/demo.ts`)

**Files:**
- Create: `src/lib/actions/demo.ts`

**Interfaces:**
- Consumes: `createAdminClient` (`@/lib/supabase/admin`), `createClient` (`@/lib/supabase/server`), `revalidatePath` (`next/cache`).
- Produces:
  - `createDemoUser(formData: FormData): Promise<{ error: string } | { success: true; email: string; password: string }>`
  - `setDemoLicense(userId: string, months: 1 | 2): Promise<{ error: string } | { success: true }>`
  - `deactivateDemoUser(userId: string, isActive: boolean): Promise<{ error: string } | { success: true }>`
  - `deleteDemoUser(userId: string): Promise<{ error: string } | { success: true }>`
  - `setDemoClass(classNum: number): Promise<{ error: string } | { success: true }>`
  - `getDemoClassOptions(): Promise<number[]>` — distinct content classes for CBSE/English, ascending.

- [ ] **Step 1: Write `demo.ts`**

Create `src/lib/actions/demo.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

const DEMO_BOARD = "CBSE";
const DEMO_MEDIUM = "English";
const DEMO_NAME = "Student Demo";

function generateDemoPassword(): string {
  // Readable 10-char password, no ambiguous chars.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function addMonthsISODate(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Distinct classes (0-12) that have chapters for the demo board/medium, ascending. */
export async function getDemoClassOptions(): Promise<number[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("chapters")
    .select("class")
    .eq("board", DEMO_BOARD)
    .eq("medium", DEMO_MEDIUM);
  const set = new Set<number>();
  for (const row of data ?? []) {
    if (typeof row.class === "number") set.add(row.class);
  }
  return Array.from(set).sort((a, b) => a - b);
}

async function requirePlatformAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "platform_admin") return { error: "Forbidden" as const };
  return { ok: true as const };
}

export async function createDemoUser(formData: FormData) {
  const guard = await requirePlatformAdmin();
  if ("error" in guard) return { error: guard.error };

  const clientName = ((formData.get("client_name") as string) || "").trim();
  const email = ((formData.get("email") as string) || "").trim();
  const phone = ((formData.get("phone") as string) || "").trim() || null;
  const licenseMonths = Number(formData.get("license_months")) === 2 ? 2 : 1;
  const classNum = Number(formData.get("class"));

  if (!clientName || !email) return { error: "Client name and email are required" };
  if (!Number.isInteger(classNum) || classNum < 0 || classNum > 12) {
    return { error: "Select a valid class" };
  }

  const admin = createAdminClient();

  // 1. Org named after the client.
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: clientName, type: "ngo", is_demo: true })
    .select("id")
    .single();
  if (orgError || !org) return { error: orgError?.message ?? "Failed to create demo org" };

  // 2. Default centre.
  const { data: centre, error: centreError } = await admin
    .from("centres")
    .insert({ name: "Centre A", org_id: org.id, is_demo: true })
    .select("id")
    .single();
  if (centreError || !centre) {
    await admin.from("organizations").delete().eq("id", org.id);
    return { error: centreError?.message ?? "Failed to create demo centre" };
  }

  // 3. Auth user.
  const password = generateDemoPassword();
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !authData.user) {
    await admin.from("organizations").delete().eq("id", org.id); // cascade removes centre
    return { error: authError?.message ?? "Failed to create demo login" };
  }

  // 4. Profile.
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      name: DEMO_NAME,
      role: "student",
      is_demo: true,
      org_id: org.id,
      centre_id: centre.id,
      class: classNum,
      board: DEMO_BOARD,
      medium: DEMO_MEDIUM,
      phone,
      license_valid_until: addMonthsISODate(licenseMonths),
    })
    .eq("id", authData.user.id);
  if (profileError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    await admin.from("organizations").delete().eq("id", org.id);
    return { error: profileError.message };
  }

  revalidatePath("/admin/demo");
  return { success: true as const, email, password };
}

export async function setDemoLicense(userId: string, months: 1 | 2) {
  const guard = await requirePlatformAdmin();
  if ("error" in guard) return { error: guard.error };
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ license_valid_until: addMonthsISODate(months) })
    .eq("id", userId)
    .eq("is_demo", true);
  if (error) return { error: error.message };
  revalidatePath("/admin/demo");
  return { success: true as const };
}

export async function deactivateDemoUser(userId: string, isActive: boolean) {
  const guard = await requirePlatformAdmin();
  if ("error" in guard) return { error: guard.error };
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId)
    .eq("is_demo", true);
  if (error) return { error: error.message };
  revalidatePath("/admin/demo");
  return { success: true as const };
}

export async function deleteDemoUser(userId: string) {
  const guard = await requirePlatformAdmin();
  if ("error" in guard) return { error: guard.error };
  const admin = createAdminClient();

  // Look up the demo user's org to remove the whole demo bundle.
  const { data: profile } = await admin
    .from("profiles")
    .select("org_id, is_demo")
    .eq("id", userId)
    .single();
  if (!profile?.is_demo) return { error: "Not a demo user" };

  await admin.from("profiles").delete().eq("id", userId);
  await admin.auth.admin.deleteUser(userId);
  if (profile.org_id) {
    // Cascade removes the demo centre.
    await admin.from("organizations").delete().eq("id", profile.org_id).eq("is_demo", true);
  }
  revalidatePath("/admin/demo");
  return { success: true as const };
}

/** Demo-only: change which class the demo learner is currently exploring. */
export async function setDemoClass(classNum: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_demo, board, medium")
    .eq("id", user.id)
    .single();
  if (!profile?.is_demo) return { error: "Forbidden" };

  const options = await getDemoClassOptions();
  if (!options.includes(classNum)) return { error: "No content for that class" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ class: classNum })
    .eq("id", user.id)
    .eq("is_demo", true);
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { success: true as const };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/anuj/Desktop/Projects/edufleet-lms-web && npx tsc --noEmit`
Expected: no errors. (If `chapters.class`/`board`/`medium` names differ, reconcile against `src/lib/supabase/types.ts` — they match `getLearnerScopeManifest`'s usage.)

- [ ] **Step 3: Lint**

Run: `cd /Users/anuj/Desktop/Projects/edufleet-lms-web && npm run lint`
Expected: no new errors for `src/lib/actions/demo.ts`.

- [ ] **Step 4: Commit**

```bash
cd /Users/anuj/Desktop/Projects/edufleet-lms-web
git add src/lib/actions/demo.ts
git commit -m "feat: add demo user server actions (create/license/class/delete)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Admin Demo page — form, table, nav link

**Files:**
- Create: `src/components/admin/create-demo-form.tsx`
- Create: `src/components/admin/demo-users-table.tsx`
- Create: `src/app/(admin)/admin/demo/page.tsx`
- Modify: `src/components/admin/admin-sidebar.tsx`

**Interfaces:**
- Consumes: demo actions from Task 2; `getDemoClassOptions`.
- Produces: `/admin/demo` route reachable from the admin sidebar (platform_admin).

- [ ] **Step 1: Create the demo table row type + creation form**

Create `src/components/admin/create-demo-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ClayButton } from "@/components/ui/clay-button";
import { ClayInput } from "@/components/ui/clay-input";
import { ClayCard } from "@/components/ui/clay-card";
import { createDemoUser } from "@/lib/actions/demo";
import { Plus, X, Copy, Check } from "lucide-react";

function classLabel(c: number) {
  return c === 0 ? "KG" : `Class ${c}`;
}

export function CreateDemoForm({ classOptions }: { classOptions: number[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await createDemoUser(new FormData(e.currentTarget));
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
    } else {
      setCreds({ email: result.email, password: result.password });
    }
  }

  function reset() {
    setOpen(false);
    setError(null);
    setCreds(null);
    setCopied(false);
  }

  if (!open) {
    return (
      <ClayButton onClick={() => setOpen(true)} size="sm">
        <Plus className="w-4 h-4" /> New Demo Link
      </ClayButton>
    );
  }

  if (creds) {
    const text = `EduFleet demo login\nEmail: ${creds.email}\nPassword: ${creds.password}`;
    return (
      <ClayCard hover={false} className="!p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-poppins font-bold text-heading text-sm">Demo login created</h3>
          <button onClick={reset} className="text-muted hover:text-heading"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-muted mb-3">Copy and share these credentials now — the password is shown only once.</p>
        <div className="rounded-clay-sm bg-cream/70 p-3 text-sm">
          <p><span className="text-muted">Email:</span> <span className="font-semibold">{creds.email}</span></p>
          <p><span className="text-muted">Password:</span> <span className="font-mono font-semibold">{creds.password}</span></p>
        </div>
        <div className="mt-4 flex gap-2">
          <ClayButton
            size="sm"
            onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); }}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? "Copied" : "Copy"}
          </ClayButton>
          <ClayButton size="sm" variant="ghost" onClick={reset}>Done</ClayButton>
        </div>
      </ClayCard>
    );
  }

  return (
    <ClayCard hover={false} className="!p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-poppins font-bold text-heading text-sm">New Demo Link</h3>
        <button onClick={reset} className="text-muted hover:text-heading"><X className="w-4 h-4" /></button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ClayInput id="demo-client" name="client_name" label="Client Name" placeholder="Acme Foundation" required />
          <ClayInput id="demo-email" name="email" type="email" label="Client Email (Login ID)" placeholder="client@example.com" required />
          <ClayInput id="demo-phone" name="phone" label="Client Phone" placeholder="Phone number" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-heading font-poppins mb-2">License Validity</label>
            <select name="license_months" className="clay-input w-full" defaultValue="1">
              <option value="1">1 month</option>
              <option value="2">2 months</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-heading font-poppins mb-2">Initial Class</label>
            <select name="class" className="clay-input w-full" required defaultValue="">
              <option value="" disabled>Select class</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>{classLabel(c)}</option>
              ))}
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <ClayButton type="submit" loading={loading} size="sm">Create Demo Login</ClayButton>
      </form>
    </ClayCard>
  );
}
```

Note: if `ClayButton` has no `variant="ghost"`, drop that prop (plain `<ClayButton size="sm" onClick={reset}>Done</ClayButton>`). Confirm against `src/components/ui/clay-button.tsx` while implementing.

- [ ] **Step 2: Create the demo users table**

Create `src/components/admin/demo-users-table.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { ClayCard } from "@/components/ui/clay-card";
import { setDemoLicense, deactivateDemoUser, deleteDemoUser } from "@/lib/actions/demo";
import { AlertTriangle, RefreshCw, Power, Trash2 } from "lucide-react";

export type DemoUserRow = {
  id: string;
  clientName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  licenseValidUntil: string | null;
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function StatusPill({ licenseValidUntil, isActive }: { licenseValidUntil: string | null; isActive: boolean }) {
  const days = daysUntil(licenseValidUntil);
  if (!isActive) {
    return <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700">Deactivated</span>;
  }
  if (days === null) {
    return <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">No expiry</span>;
  }
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700">
        <AlertTriangle className="h-3 w-3" /> Expired
      </span>
    );
  }
  if (days < 7) {
    return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Expiring · {days}d</span>;
  }
  return <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Active · {days}d</span>;
}

export function DemoUsersTable({ rows }: { rows: DemoUserRow[] }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function run(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    startTransition(async () => {
      await fn();
      setBusyId(null);
    });
  }

  if (rows.length === 0) {
    return <ClayCard hover={false} className="!p-6 text-center text-sm text-muted">No demo links yet.</ClayCard>;
  }

  return (
    <ClayCard hover={false} className="!p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-orange-primary/10 text-left text-xs text-muted">
            <th className="px-4 py-3 font-semibold">Client</th>
            <th className="px-4 py-3 font-semibold">Email</th>
            <th className="px-4 py-3 font-semibold">Phone</th>
            <th className="px-4 py-3 font-semibold">Created</th>
            <th className="px-4 py-3 font-semibold">Expiry</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-orange-primary/5 last:border-0">
              <td className="px-4 py-3 font-semibold text-heading">{r.clientName}</td>
              <td className="px-4 py-3 text-body">{r.email ?? "—"}</td>
              <td className="px-4 py-3 text-body">{r.phone ?? "—"}</td>
              <td className="px-4 py-3 text-body">{r.createdAt.slice(0, 10)}</td>
              <td className="px-4 py-3 text-body">{r.licenseValidUntil ?? "—"}</td>
              <td className="px-4 py-3"><StatusPill licenseValidUntil={r.licenseValidUntil} isActive={r.isActive} /></td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    title="Extend 1 month"
                    disabled={pending && busyId === r.id}
                    onClick={() => run(r.id, () => setDemoLicense(r.id, 1))}
                    className="rounded-lg p-2 text-body hover:bg-cream/80 hover:text-orange-primary disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button
                    title={r.isActive ? "Deactivate" : "Reactivate"}
                    disabled={pending && busyId === r.id}
                    onClick={() => run(r.id, () => deactivateDemoUser(r.id, !r.isActive))}
                    className="rounded-lg p-2 text-body hover:bg-cream/80 hover:text-orange-primary disabled:opacity-50"
                  >
                    <Power className="h-4 w-4" />
                  </button>
                  <button
                    title="Delete demo"
                    disabled={pending && busyId === r.id}
                    onClick={() => { if (confirm(`Delete demo for ${r.clientName}? This removes the login and its org.`)) run(r.id, () => deleteDemoUser(r.id)); }}
                    className="rounded-lg p-2 text-body hover:bg-red-50/80 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ClayCard>
  );
}
```

- [ ] **Step 3: Create the Demo page**

Create `src/app/(admin)/admin/demo/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDemoClassOptions } from "@/lib/actions/demo";
import { CreateDemoForm } from "@/components/admin/create-demo-form";
import { DemoUsersTable, type DemoUserRow } from "@/components/admin/demo-users-table";

export const metadata = { title: "Demo Links" };
export const dynamic = "force-dynamic";

export default async function AdminDemoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "platform_admin") redirect("/admin");

  const admin = createAdminClient();
  const [{ data: demoProfiles }, classOptions] = await Promise.all([
    admin
      .from("profiles")
      .select("id, phone, is_active, created_at, license_valid_until, org_id, organizations(name)")
      .eq("is_demo", true)
      .order("created_at", { ascending: false }),
    getDemoClassOptions(),
  ]);

  // Emails live in auth.users — fetch via admin API.
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map((authList?.users ?? []).map((u) => [u.id, u.email ?? null]));

  const rows: DemoUserRow[] = (demoProfiles ?? []).map((p) => ({
    id: p.id,
    clientName: (p.organizations as unknown as { name: string } | null)?.name ?? "—",
    email: emailById.get(p.id) ?? null,
    phone: p.phone,
    isActive: p.is_active,
    createdAt: p.created_at,
    licenseValidUntil: p.license_valid_until,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-poppins text-2xl font-bold text-heading">Demo Links</h1>
        <p className="text-sm text-muted">Create and manage demo logins for prospective clients.</p>
      </div>
      <CreateDemoForm classOptions={classOptions} />
      <DemoUsersTable rows={rows} />
    </div>
  );
}
```

- [ ] **Step 4: Add the sidebar nav item**

In `src/components/admin/admin-sidebar.tsx`, add `Sparkles` to the lucide-react import (line ~7-24 import block), then add this entry to the `platformAdminLinks` array (after the `contacts` entry):

```tsx
  { href: "/admin/demo", label: "Demo Links", icon: Sparkles },
```

(Only `platformAdminLinks` — do not add to org/centre admin arrays.)

- [ ] **Step 5: Typecheck + lint**

Run: `cd /Users/anuj/Desktop/Projects/edufleet-lms-web && npx tsc --noEmit && npm run lint`
Expected: no errors. Reconcile any `ClayButton`/`ClayInput`/`ClayCard` prop mismatches against their component files.

- [ ] **Step 6: Manual check**

Run the dev server (`npm run dev`), log in as a platform admin, open `/admin/demo`. Create a demo (client name, an email you control, class from the dropdown, 1 month). Confirm: credentials card appears with a copyable password; the row shows in the table with a green `Active · Nd` pill. Then verify in the DB (Supabase table editor or a quick service-role query) that an `organizations` row (is_demo, named the client), a `centres` "Centre A" (is_demo), and a `profiles` row (`is_demo`, name "Student Demo", role student, class set, `license_valid_until` ~1 month out) exist.

- [ ] **Step 7: Commit**

```bash
cd /Users/anuj/Desktop/Projects/edufleet-lms-web
git add src/components/admin/create-demo-form.tsx src/components/admin/demo-users-table.tsx "src/app/(admin)/admin/demo/page.tsx" src/components/admin/admin-sidebar.tsx
git commit -m "feat: admin Demo Links page — create form, users table, nav item

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Dashboard class switcher for demo users

**Files:**
- Create: `src/components/dashboard/demo-class-switcher.tsx`
- Modify: `src/components/dashboard/sidebar.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `setDemoClass`, `getDemoClassOptions` (Task 2).
- Produces: demo users see a class selector + current-class badge + "Impact Analytics" link in the dashboard sidebar; switching re-scopes the whole dashboard.

- [ ] **Step 1: Create the class switcher**

Create `src/components/dashboard/demo-class-switcher.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDemoClass } from "@/lib/actions/demo";
import { GraduationCap } from "lucide-react";

function classLabel(c: number) {
  return c === 0 ? "KG" : `Class ${c}`;
}

export function DemoClassSwitcher({
  currentClass,
  options,
}: {
  currentClass: number | null;
  options: number[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-1 mb-2 rounded-clay-sm bg-cream/70 px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-orange-primary">
        <GraduationCap className="h-3.5 w-3.5" /> Demo · Viewing {currentClass === null ? "—" : classLabel(currentClass)}
      </div>
      <select
        aria-label="Switch class"
        className="clay-input w-full !py-2 text-sm"
        value={currentClass ?? ""}
        disabled={pending}
        onChange={(e) => {
          const next = Number(e.target.value);
          startTransition(async () => {
            const res = await setDemoClass(next);
            if (!("error" in res)) router.refresh();
          });
        }}
      >
        {options.map((c) => (
          <option key={c} value={c}>{classLabel(c)}</option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Wire the switcher + Impact link into the sidebar**

In `src/components/dashboard/sidebar.tsx`:

(a) Add to the lucide-react import block: `TrendingUp`.
(b) Add an import near the top: `import { DemoClassSwitcher } from "@/components/dashboard/demo-class-switcher";`
(c) Extend `SidebarProps`:

```tsx
interface SidebarProps {
  userRole: string;
  userName: string;
  mobileSlot?: React.ReactNode;
  isDemo?: boolean;
  demoCurrentClass?: number | null;
  demoClassOptions?: number[];
}
```

(d) Update the destructure: `export function Sidebar({ userRole, userName, mobileSlot, isDemo = false, demoCurrentClass = null, demoClassOptions = [] }: SidebarProps) {`

(e) After `const links = userRole === "teacher" ? teacherLinks : studentLinks;`, append the demo Impact link:

```tsx
  const navLinks: DashboardLink[] = isDemo
    ? [...links, { href: "/dashboard/impact", label: "Impact Analytics", icon: TrendingUp }]
    : links;
```

Then replace the two `links.map(...)` usages (desktop `<nav>` and mobile bottom bar `links.slice(0, 4)`) with `navLinks` (`navLinks.map(...)` and `navLinks.slice(0, 4)`).

(f) In the desktop `<nav>`, immediately before the `{navLinks.map(...)}` call, render the switcher for demo users:

```tsx
          {isDemo && demoClassOptions.length > 0 && (
            <DemoClassSwitcher currentClass={demoCurrentClass} options={demoClassOptions} />
          )}
```

- [ ] **Step 3: Pass demo props from the dashboard layout**

In `src/app/(dashboard)/layout.tsx`:

(a) Add import: `import { getDemoClassOptions } from "@/lib/actions/demo";`
(b) Add `is_demo` to the profile select string (line ~23): `.select("role, name, org_id, centre_id, class, board, medium, phone, avatar_url, ui_language, is_demo")`.
(c) After the `orgResult/centreResult` `Promise.all`, compute demo options only when needed:

```tsx
  const demoClassOptions = profile.is_demo ? await getDemoClassOptions() : [];
```

(d) Pass the new props to `<Sidebar>`:

```tsx
        <Sidebar
          userRole={profile.role}
          userName={profile.name}
          mobileSlot={<ProfileDrawer {...drawerProps} compact />}
          isDemo={profile.is_demo}
          demoCurrentClass={profile.class}
          demoClassOptions={demoClassOptions}
        />
```

- [ ] **Step 4: Typecheck + lint**

Run: `cd /Users/anuj/Desktop/Projects/edufleet-lms-web && npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual check**

Log in as the demo user created in Task 3. Confirm the sidebar shows "Demo · Viewing Class N", a class dropdown, and an "Impact Analytics" link. Watch part of a video, then switch class in the dropdown: the dashboard content changes to the new class and its (empty) stats. Switch back: the earlier class's progress reappears (cumulative). Confirm a normal (non-demo) student sees none of these demo controls.

- [ ] **Step 6: Commit**

```bash
cd /Users/anuj/Desktop/Projects/edufleet-lms-web
git add src/components/dashboard/demo-class-switcher.tsx src/components/dashboard/sidebar.tsx "src/app/(dashboard)/layout.tsx"
git commit -m "feat: demo class switcher + Impact link in dashboard sidebar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Demo Impact Analytics — org-locked, demo-excluded from real reporting

**Files:**
- Modify: `src/lib/analytics-v2/server.ts`
- Modify: `src/app/(admin)/admin/orgs/page.tsx`
- Modify: `src/app/(admin)/admin/users/page.tsx`
- Create: `src/app/(dashboard)/dashboard/impact/page.tsx`

**Interfaces:**
- Consumes: `loadImpactDashboard`, `ImpactDashboardClient` (`src/app/(admin)/admin/analytics-v2/client.tsx`).
- Produces: `loadImpactDashboard(options & { includeDemo?: boolean })`; a caller-scoped `loadImpactDashboardAction` that forces a demo user to their own org; `/dashboard/impact` route for demo users only.

- [ ] **Step 1: Add `includeDemo` and demo exclusion to `loadImpactDashboard`**

In `src/lib/analytics-v2/server.ts`, extend the options type on `loadImpactDashboard` (line ~154) to include `includeDemo?: boolean`:

```ts
export async function loadImpactDashboard(options?: {
  orgId?: string;
  centreId?: string;
  classNum?: number;
  subjectId?: string;
  includeDemo?: boolean;
}): Promise<ImpactDashboard> {
```

Then add a local near the top of the body (after `const supabase = createAdminClient();`):

```ts
  const includeDemo = options?.includeDemo ?? false;
```

Apply the exclusion at the three query sites:

- Centre query (after the existing `.eq("is_active", true)` on `centreQuery`, line ~169):
  ```ts
  if (!includeDemo) centreQuery = centreQuery.eq("is_demo", false);
  ```
- Learner query (after its `.eq("is_active", true)`, line ~180):
  ```ts
  if (!includeDemo) learnerQuery = learnerQuery.eq("is_demo", false);
  ```
- Org list query (line ~499). Replace:
  ```ts
  const { data: orgRows } = await supabase.from("organizations").select("id, name, type").eq("is_active", true);
  ```
  with:
  ```ts
  let orgListQuery = supabase.from("organizations").select("id, name, type").eq("is_active", true);
  if (!includeDemo) orgListQuery = orgListQuery.eq("is_demo", false);
  const { data: orgRows } = await orgListQuery;
  ```

- [ ] **Step 2: Harden `loadImpactDashboardAction` with caller scoping**

In `src/lib/analytics-v2/server.ts`, replace the existing `loadImpactDashboardAction` (lines ~5-13) with a version that derives scope from the authenticated caller and never trusts client-supplied org/centre for demo/non-platform users:

```ts
import { createClient } from "@/lib/supabase/server";

/** Server action for client-side drill-down. Scopes strictly to the caller. */
export async function loadImpactDashboardAction(options?: {
  orgId?: string;
  centreId?: string;
  classNum?: number;
  subjectId?: string;
}): Promise<ImpactDashboard> {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, org_id, centre_id, is_demo")
    .eq("id", user.id)
    .single();
  if (!profile) throw new Error("No profile");

  const { role, org_id, centre_id, is_demo } = profile;

  // Demo users: locked to their own org, demo data included, org can't be overridden.
  if (is_demo) {
    if (!org_id) throw new Error("Demo user has no org");
    let centreId = options?.centreId;
    if (centreId) {
      const { data: c } = await admin.from("centres").select("id").eq("id", centreId).eq("org_id", org_id).maybeSingle();
      if (!c) centreId = undefined; // ignore centres outside the demo org
    }
    return loadImpactDashboard({ orgId: org_id, centreId, classNum: options?.classNum, subjectId: options?.subjectId, includeDemo: true });
  }

  // Real admins: exclude demo data; lock scope to their level.
  if (role === "platform_admin") {
    return loadImpactDashboard({ ...options, includeDemo: false });
  }
  if (role === "org_admin") {
    if (!org_id) throw new Error("Org admin has no org");
    let centreId = options?.centreId;
    if (centreId) {
      const { data: c } = await admin.from("centres").select("id").eq("id", centreId).eq("org_id", org_id).maybeSingle();
      if (!c) centreId = undefined;
    }
    return loadImpactDashboard({ orgId: org_id, centreId, classNum: options?.classNum, subjectId: options?.subjectId, includeDemo: false });
  }
  if (role === "centre_admin") {
    if (!centre_id) throw new Error("Centre admin has no centre");
    return loadImpactDashboard({ centreId: centre_id, classNum: options?.classNum, subjectId: options?.subjectId, includeDemo: false });
  }

  throw new Error("Forbidden");
}
```

(Keep the existing `createAdminClient` import; add the `createClient` import at the top of the file if not already present.)

- [ ] **Step 2b: Hide demo orgs/centres from real admin management lists**

In `src/app/(admin)/admin/orgs/page.tsx` (line ~33), add `.eq("is_demo", false)` to the organizations query:

```ts
    supabase.from("organizations").select("id, name, type, is_active, created_at, license_valid_until").eq("is_demo", false).order("name"),
```

In `src/app/(admin)/admin/users/page.tsx` (lines ~114-115), add `.eq("is_demo", false)` to the org and centre dropdown queries:

```ts
    supabase.from("organizations").select("id, name").eq("is_active", true).eq("is_demo", false).order("name"),
    supabase.from("centres").select("id, name, org_id").eq("is_active", true).eq("is_demo", false).order("name"),
```

This keeps demo orgs/centres out of the Organizations page and the Create User dropdowns; they are managed solely from `/admin/demo`.

- [ ] **Step 3: Create the demo Impact page**

Create `src/app/(dashboard)/dashboard/impact/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadImpactDashboard } from "@/lib/analytics-v2/server";
import { ImpactDashboardClient } from "@/app/(admin)/admin/analytics-v2/client";

export const metadata = { title: "Impact Analytics" };
export const dynamic = "force-dynamic";

export default async function DemoImpactPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_demo, org_id, name")
    .eq("id", user.id)
    .single();

  if (!profile?.is_demo) redirect("/dashboard");
  if (!profile.org_id) {
    return <div className="p-6 text-sm text-muted">No demo organization is linked to this account.</div>;
  }

  const dashboard = await loadImpactDashboard({ orgId: profile.org_id, includeDemo: true });
  return <ImpactDashboardClient data={dashboard} userName={profile.name ?? "Demo"} />;
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `cd /Users/anuj/Desktop/Projects/edufleet-lms-web && npx tsc --noEmit && npm run lint`
Expected: no errors. In particular, importing `ImpactDashboardClient` across route groups is a plain module import and is allowed.

- [ ] **Step 5: Manual check — demo + real admin**

- As the demo user, open the "Impact Analytics" link. Confirm it renders scoped to the demo org (its Centre A only). If empty, it should show empty/zero states without errors. Attempt drill-down clicks; they must stay within the demo org.
- As a `platform_admin`, open `/admin/analytics-v2`. Confirm the demo org does **not** appear in the org list/overview and the page still renders and drills correctly.
- Confirm a non-demo student hitting `/dashboard/impact` is redirected to `/dashboard`.

- [ ] **Step 6: Commit**

```bash
cd /Users/anuj/Desktop/Projects/edufleet-lms-web
git add src/lib/analytics-v2/server.ts "src/app/(dashboard)/dashboard/impact/page.tsx" "src/app/(admin)/admin/orgs/page.tsx" "src/app/(admin)/admin/users/page.tsx"
git commit -m "feat: org-locked demo Impact Analytics; exclude demo orgs from real reporting

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Demo-specific expired-license message at login

**Files:**
- Modify: `src/lib/actions/auth.ts`

**Interfaces:**
- Consumes: existing `validate_license` RPC + login flow.
- Produces: demo accounts see `"Demo Licence Validity Expired - contact Admin"` on expiry; all others keep the generic message.

- [ ] **Step 1: Branch the message on `is_demo`**

In `src/lib/actions/auth.ts`, change the profile select to include `is_demo` and branch the expiry message. Replace:

```ts
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) return { error: "Profile not found. Contact your administrator." };

  // Check licence validity (cascades: profile → centre → org)
  if (profile.role !== "platform_admin") {
    const { data: licenceResult } = await supabase.rpc("validate_license", {
      target_user_id: user.id,
    });
    if (licenceResult && !licenceResult.valid) {
      await supabase.auth.signOut({ scope: "local" });
      return { error: "Your licence has expired. Contact your administrator." };
    }
  }
```

with:

```ts
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_demo")
    .eq("id", user.id)
    .single();

  if (!profile) return { error: "Profile not found. Contact your administrator." };

  // Check licence validity (cascades: profile → centre → org)
  if (profile.role !== "platform_admin") {
    const { data: licenceResult } = await supabase.rpc("validate_license", {
      target_user_id: user.id,
    });
    if (licenceResult && !licenceResult.valid) {
      await supabase.auth.signOut({ scope: "local" });
      return {
        error: profile.is_demo
          ? "Demo Licence Validity Expired - contact Admin"
          : "Your licence has expired. Contact your administrator.",
      };
    }
  }
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/anuj/Desktop/Projects/edufleet-lms-web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual check**

Set the demo user's `license_valid_until` to yesterday (Supabase editor or the admin table can't set past dates, so use SQL: `update profiles set license_valid_until = current_date - 1 where id = '<demo id>';`). Attempt to log in as the demo user: login is rejected with exactly `"Demo Licence Validity Expired - contact Admin"` and the session is not established. Then in `/admin/demo`, click "Extend 1 month" for that row and confirm login works again and the pill returns to green.

- [ ] **Step 4: Commit**

```bash
cd /Users/anuj/Desktop/Projects/edufleet-lms-web
git add src/lib/actions/auth.ts
git commit -m "feat: demo-specific expired-license message at login

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final Verification

- [ ] **Full typecheck + lint + build**

Run: `cd /Users/anuj/Desktop/Projects/edufleet-lms-web && npx tsc --noEmit && npm run lint && npm run build`
Expected: build succeeds with no type or lint errors.

- [ ] **End-to-end smoke (manual)**

As platform admin: create a demo (2 months) → copy credentials. As the demo user: log in → dashboard shows demo class switcher + Impact link; switch classes and confirm per-class stats accumulate/reappear; open Impact Analytics scoped to the demo org. As platform admin: confirm the demo org is absent from real Impact Analytics; extend/deactivate/delete from the demo table works. Expire the demo (SQL) → login blocked with the exact demo message.
