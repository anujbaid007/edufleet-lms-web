"use client";

import { useState } from "react";
import { Building2, MapPin, User, ChevronRight, ChevronDown, Shield } from "lucide-react";
import { ClayCard } from "@/components/ui/clay-card";
import { EditUserRow } from "./edit-user-row";

interface UserData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  org_id: string | null;
  centre_id: string | null;
  teacher_id: string | null;
  class: number | null;
  board: string | null;
  medium: string | null;
  is_active: boolean;
}

interface TreeNode {
  org: { id: string; name: string };
  orgAdmins: UserData[];
  centres: {
    centre: { id: string; name: string; org_id: string };
    users: UserData[];
  }[];
}

interface Props {
  tree: TreeNode[];
  unlinkedUsers: UserData[];
  roleBadgeColors: Record<string, string>;
  organizations: { id: string; name: string }[];
  centres: { id: string; name: string; org_id: string }[];
  teachers: { id: string; name: string; centre_id: string | null }[];
}

function RoleBadge({ role, colors }: { role: string; colors: Record<string, string> }) {
  return (
    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${colors[role] ?? "bg-gray-100 text-gray-600"}`}>
      {role.replace("_", " ")}
    </span>
  );
}

function UserRow({
  u,
  roleBadgeColors,
  organizations,
  centres,
  teachers,
}: {
  u: UserData;
  roleBadgeColors: Record<string, string>;
  organizations: { id: string; name: string }[];
  centres: { id: string; name: string; org_id: string }[];
  teachers: { id: string; name: string; centre_id: string | null }[];
}) {
  return (
    <div className="rounded-2xl px-3 py-3 transition-colors hover:bg-orange-50/40">
      <div className="group flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-orange-50 shadow-sm">
          <User className="h-4 w-4 text-orange-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-heading">{u.name}</span>
            <RoleBadge role={u.role} colors={roleBadgeColors} />
            {!u.is_active && (
              <span className="px-2 py-0.5 text-[10px] bg-red-100 text-red-600 rounded-full font-medium">Inactive</span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">
            {u.email}
            {u.phone ? ` · ${u.phone}` : ""}
            {u.class !== null ? ` · ${u.class === 0 ? "KG" : u.class === 99 ? "General" : `Class ${u.class}`}` : ""}
            {u.board ? ` · ${u.board}` : ""}
            {u.medium ? ` · ${u.medium}` : ""}
          </p>
          <div className="mt-3">
            <EditUserRow
              user={u}
              organizations={organizations}
              centres={centres}
              teachers={teachers}
            />
          </div>
        </div>
        <div className="pt-1 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-muted shadow-sm">
            Manage
          </span>
        </div>
      </div>
    </div>
  );
}

function CentreSection({
  centre,
  users,
  roleBadgeColors,
  organizations,
  centres,
  teachers,
}: {
  centre: { id: string; name: string };
  users: UserData[];
  roleBadgeColors: Record<string, string>;
  organizations: { id: string; name: string }[];
  centres: { id: string; name: string; org_id: string }[];
  teachers: { id: string; name: string; centre_id: string | null }[];
}) {
  const [open, setOpen] = useState(true);
  const teacherCount = users.filter((u) => u.role === "teacher").length;
  const studentCount = users.filter((u) => u.role === "student").length;

  return (
    <div className="ml-6 border-l-2 border-orange-primary/10">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 w-full text-left hover:bg-orange-50/40 rounded-r-lg transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4 text-muted" /> : <ChevronRight className="w-4 h-4 text-muted" />}
        <MapPin className="w-4 h-4 text-orange-primary" />
        <span className="text-sm font-semibold text-heading">{centre.name}</span>
        <span className="text-xs text-muted ml-1">
          {teacherCount}T · {studentCount}S
        </span>
      </button>
      {open && (
        <div className="ml-4 space-y-0.5 pb-2">
          {users.length > 0 ? (
            users.map((u) => (
              <UserRow
                key={u.id}
                u={u}
                roleBadgeColors={roleBadgeColors}
                organizations={organizations}
                centres={centres}
                teachers={teachers}
              />
            ))
          ) : (
            <p className="text-xs text-muted px-4 py-2">No users in this centre</p>
          )}
        </div>
      )}
    </div>
  );
}

export function UserTree({ tree, unlinkedUsers, roleBadgeColors, organizations, centres, teachers }: Props) {
  return (
    <div className="space-y-3">
      {tree.map(({ org, orgAdmins, centres: orgCentres }) => (
        <OrgSection
          key={org.id}
          org={org}
          orgAdmins={orgAdmins}
          orgCentres={orgCentres}
          roleBadgeColors={roleBadgeColors}
          organizations={organizations}
          centres={centres}
          teachers={teachers}
        />
      ))}

      {unlinkedUsers.length > 0 && (
        <ClayCard hover={false} className="!p-4">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-2">
            <Shield className="w-5 h-5 text-purple-500" />
            <span className="text-sm font-bold text-heading">Platform / Unlinked</span>
            <span className="text-xs text-muted ml-1">{unlinkedUsers.length} users</span>
          </div>
          <div className="space-y-0.5">
            {unlinkedUsers.map((u) => (
              <UserRow
                key={u.id}
                u={u}
                roleBadgeColors={roleBadgeColors}
                organizations={organizations}
                centres={centres}
                teachers={teachers}
              />
            ))}
          </div>
        </ClayCard>
      )}
    </div>
  );
}

function OrgSection({
  org,
  orgAdmins,
  orgCentres,
  roleBadgeColors,
  organizations,
  centres,
  teachers,
}: {
  org: { id: string; name: string };
  orgAdmins: UserData[];
  orgCentres: { centre: { id: string; name: string; org_id: string }; users: UserData[] }[];
  roleBadgeColors: Record<string, string>;
  organizations: { id: string; name: string }[];
  centres: { id: string; name: string; org_id: string }[];
  teachers: { id: string; name: string; centre_id: string | null }[];
}) {
  const [open, setOpen] = useState(true);
  const totalUsers = orgAdmins.length + orgCentres.reduce((sum, c) => sum + c.users.length, 0);

  return (
    <ClayCard hover={false} className="!p-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 w-full text-left hover:bg-orange-50/40 rounded-lg transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4 text-muted" /> : <ChevronRight className="w-4 h-4 text-muted" />}
        <Building2 className="w-5 h-5 text-orange-primary" />
        <span className="text-sm font-bold text-heading">{org.name}</span>
        <span className="text-xs text-muted ml-1">
          {orgCentres.length} centres · {totalUsers} users
        </span>
      </button>

      {open && (
        <div className="mt-1">
          {/* Org admins */}
          {orgAdmins.length > 0 && (
            <div className="ml-6 border-l-2 border-purple-200 mb-2">
              {orgAdmins.map((u) => (
                <UserRow
                  key={u.id}
                  u={u}
                  roleBadgeColors={roleBadgeColors}
                  organizations={organizations}
                  centres={centres}
                  teachers={teachers}
                />
              ))}
            </div>
          )}

          {/* Centres */}
          {orgCentres.map(({ centre, users }) => (
            <CentreSection
              key={centre.id}
              centre={centre}
              users={users}
              roleBadgeColors={roleBadgeColors}
              organizations={organizations}
              centres={centres}
              teachers={teachers}
            />
          ))}

          {orgCentres.length === 0 && orgAdmins.length === 0 && (
            <p className="text-xs text-muted px-8 py-2">No centres or users in this organization</p>
          )}
        </div>
      )}
    </ClayCard>
  );
}
