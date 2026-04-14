import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { UserTree } from "@/components/admin/user-tree";
import { createRequestProfiler } from "@/lib/perf";

export const metadata = { title: "Users" };
const USER_PAGE_SIZE = 40;

const roleBadgeColors: Record<string, string> = {
  platform_admin: "bg-purple-100 text-purple-700",
  org_admin: "bg-blue-100 text-blue-700",
  centre_admin: "bg-green-100 text-green-700",
  teacher: "bg-orange-100 text-orange-700",
  student: "bg-gray-100 text-gray-600",
};

type UsersPageSearchParams = {
  q?: string;
  role?: string;
  orgId?: string;
  centreId?: string;
  page?: string;
};

function normalizeSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parsePage(value: string) {
  const page = Number.parseInt(value, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function buildUsersHref(params: {
  q?: string;
  role?: string;
  orgId?: string;
  centreId?: string;
  page?: number;
}) {
  const searchParams = new URLSearchParams();

  if (params.q) searchParams.set("q", params.q);
  if (params.role) searchParams.set("role", params.role);
  if (params.orgId) searchParams.set("orgId", params.orgId);
  if (params.centreId) searchParams.set("centreId", params.centreId);
  if (params.page && params.page > 1) searchParams.set("page", String(params.page));

  const query = searchParams.toString();
  return query ? `/admin/users?${query}` : "/admin/users";
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams?: Promise<UsersPageSearchParams>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const q = normalizeSearchParam(resolvedSearchParams.q).trim();
  const selectedRole = normalizeSearchParam(resolvedSearchParams.role).trim();
  const selectedOrgId = normalizeSearchParam(resolvedSearchParams.orgId).trim();
  const selectedCentreId = normalizeSearchParam(resolvedSearchParams.centreId).trim();
  const currentPage = parsePage(normalizeSearchParam(resolvedSearchParams.page));
  const perf = createRequestProfiler("admin.users", {
    q: q || null,
    role: selectedRole || null,
    orgId: selectedOrgId || null,
    centreId: selectedCentreId || null,
    page: currentPage,
  });
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  perf.mark("auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id, centre_id")
    .eq("id", session.user.id)
    .single();

  if (!profile) redirect("/login");
  perf.mark("profile");

  let usersQuery = supabase
    .from("profiles")
    .select(
      "id, name, role, org_id, centre_id, class, board, medium, is_active, teacher_id, phone, created_at",
      { count: "exact" }
    )
    .order("name");

  if (selectedRole) usersQuery = usersQuery.eq("role", selectedRole);
  if (selectedOrgId) usersQuery = usersQuery.eq("org_id", selectedOrgId);
  if (selectedCentreId) usersQuery = usersQuery.eq("centre_id", selectedCentreId);
  if (q) usersQuery = usersQuery.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);

  const from = (currentPage - 1) * USER_PAGE_SIZE;
  const to = from + USER_PAGE_SIZE - 1;

  const [
    { data: pagedUsers, count: totalUsers },
    { data: orgs },
    { data: centres },
    { data: teacherProfiles },
  ] = await Promise.all([
    usersQuery.range(from, to),
    supabase.from("organizations").select("id, name").eq("is_active", true).order("name"),
    supabase.from("centres").select("id, name, org_id").eq("is_active", true).order("name"),
    supabase.from("profiles").select("id, name, centre_id").eq("role", "teacher").eq("is_active", true).order("name"),
  ]);
  perf.record("pagedUserCount", pagedUsers?.length ?? 0);
  perf.record("totalUserCount", totalUsers ?? 0);
  perf.record("orgCount", orgs?.length ?? 0);
  perf.record("centreCount", centres?.length ?? 0);
  perf.record("teacherCount", teacherProfiles?.length ?? 0);
  perf.mark("page-data");

  // Fetch emails only for the visible page instead of sweeping all auth users.
  const adminClient = createAdminClient();
  const emailMap = new Map<string, string>();

  const authUsers = await Promise.all(
    (pagedUsers ?? []).map(async (user) => {
      const { data } = await adminClient.auth.admin.getUserById(user.id);
      return data.user ?? null;
    })
  );

  for (const authUser of authUsers) {
    if (authUser?.email) emailMap.set(authUser.id, authUser.email);
  }
  perf.record("emailFetchCount", authUsers.length);
  perf.mark("emails");

  // Build hierarchy
  const orgList = orgs ?? [];
  const centreList = centres ?? [];
  const users = (pagedUsers ?? []).map((u) => ({ ...u, email: emailMap.get(u.id) ?? "" }));

  // Org admins (shown at org level regardless of centre)
  const orgAdmins = (orgId: string) =>
    users.filter((u) => u.org_id === orgId && u.role === "org_admin");

  // Users per centre
  const centreUsers = (centreId: string) =>
    users.filter((u) => u.centre_id === centreId && u.role !== "org_admin");

  // Centres per org
  const orgCentres = (orgId: string) =>
    centreList.filter((c) => c.org_id === orgId);

  // Users without an org (platform admins, unlinked)
  const unlinkedUsers = users.filter((u) => !u.org_id);

  const tree = orgList.map((org) => ({
    org,
    orgAdmins: orgAdmins(org.id),
    centres: orgCentres(org.id).map((centre) => ({
      centre,
      users: centreUsers(centre.id),
    })),
  }));
  perf.record("treeOrgCount", tree.length);
  perf.record("unlinkedUserCount", unlinkedUsers.length);
  perf.mark("tree");
  perf.flush();

  const totalUserCount = totalUsers ?? users.length;
  const totalPages = Math.max(1, Math.ceil(totalUserCount / USER_PAGE_SIZE));
  const visibleFrom = totalUserCount === 0 ? 0 : from + 1;
  const visibleTo = totalUserCount === 0 ? 0 : Math.min(from + users.length, totalUserCount);
  const hasFilters = Boolean(q || selectedRole || selectedOrgId || selectedCentreId);
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <div className="space-y-6">
      <Header
        title="Users"
        subtitle={
          totalUserCount > USER_PAGE_SIZE || hasFilters
            ? `${totalUserCount} users · showing ${visibleFrom}-${visibleTo}`
            : `${totalUserCount} users`
        }
      />

      {profile.role === "platform_admin" ? (
        <CreateUserForm
          organizations={orgList}
          centres={centreList}
          teachers={teacherProfiles ?? []}
          currentUserRole={profile.role}
          currentUserOrgId={profile.org_id}
          currentUserCentreId={profile.centre_id}
        />
      ) : null}

      <ClayCard hover={false} className="!p-5">
        <form className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_auto]">
          <label className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Search</span>
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search by name or phone"
              className="h-11 w-full rounded-2xl border border-orange-primary/20 bg-white/90 px-4 text-sm text-heading outline-none transition focus:border-orange-primary/60 focus:ring-4 focus:ring-orange-primary/10"
            />
          </label>

          <label className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Role</span>
            <select
              name="role"
              defaultValue={selectedRole}
              className="h-11 w-full rounded-2xl border border-orange-primary/20 bg-white/90 px-4 text-sm text-heading outline-none transition focus:border-orange-primary/60 focus:ring-4 focus:ring-orange-primary/10"
            >
              <option value="">All roles</option>
              <option value="platform_admin">Platform Admin</option>
              <option value="org_admin">Org Admin</option>
              <option value="centre_admin">Centre Admin</option>
              <option value="teacher">Teacher</option>
              <option value="student">Student</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Organization</span>
            <select
              name="orgId"
              defaultValue={selectedOrgId}
              className="h-11 w-full rounded-2xl border border-orange-primary/20 bg-white/90 px-4 text-sm text-heading outline-none transition focus:border-orange-primary/60 focus:ring-4 focus:ring-orange-primary/10"
            >
              <option value="">All organizations</option>
              {orgList.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Centre</span>
            <select
              name="centreId"
              defaultValue={selectedCentreId}
              className="h-11 w-full rounded-2xl border border-orange-primary/20 bg-white/90 px-4 text-sm text-heading outline-none transition focus:border-orange-primary/60 focus:ring-4 focus:ring-orange-primary/10"
            >
              <option value="">All centres</option>
              {centreList
                .filter((centre) => !selectedOrgId || centre.org_id === selectedOrgId)
                .map((centre) => (
                  <option key={centre.id} value={centre.id}>
                    {centre.name}
                  </option>
                ))}
            </select>
          </label>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-orange-primary px-4 text-sm font-semibold text-white shadow-clay-orange"
            >
              Apply
            </button>
            <Link
              href="/admin/users"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600"
            >
              Reset
            </Link>
          </div>
        </form>

        {hasFilters ? (
          <p className="mt-3 text-xs text-muted">
            Results are grouped within the current filtered page so the screen stays fast as the user base grows.
          </p>
        ) : null}
      </ClayCard>

      <UserTree
        tree={tree}
        unlinkedUsers={unlinkedUsers}
        roleBadgeColors={roleBadgeColors}
        organizations={orgList}
        centres={centreList}
        teachers={teacherProfiles ?? []}
      />

      <div className="flex flex-col gap-3 rounded-[24px] border border-orange-primary/10 bg-white/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-body">
          {totalUserCount === 0
            ? "No users match the current filters."
            : `Showing ${visibleFrom}-${visibleTo} of ${totalUserCount} users`}
        </p>
        <div className="flex items-center gap-2">
          {canGoPrev ? (
            <Link
              href={buildUsersHref({
                q,
                role: selectedRole,
                orgId: selectedOrgId,
                centreId: selectedCentreId,
                page: currentPage - 1,
              })}
              className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600"
            >
              Previous
            </Link>
          ) : (
            <span className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 px-4 text-sm font-semibold text-slate-400">
              Previous
            </span>
          )}
          <span className="inline-flex h-10 items-center justify-center rounded-2xl bg-orange-50 px-4 text-sm font-semibold text-orange-primary">
            Page {currentPage} of {totalPages}
          </span>
          {canGoNext ? (
            <Link
              href={buildUsersHref({
                q,
                role: selectedRole,
                orgId: selectedOrgId,
                centreId: selectedCentreId,
                page: currentPage + 1,
              })}
              className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600"
            >
              Next
            </Link>
          ) : (
            <span className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 px-4 text-sm font-semibold text-slate-400">
              Next
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
