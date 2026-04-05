"use client";

import { useState } from "react";
import { ClayButton } from "@/components/ui/clay-button";
import { ClayInput } from "@/components/ui/clay-input";
import { ClayCard } from "@/components/ui/clay-card";
import { createUser } from "@/lib/actions/admin";
import { Plus, X } from "lucide-react";

interface CreateUserFormProps {
  organizations: Array<{ id: string; name: string }>;
  centres: Array<{ id: string; name: string; org_id: string }>;
  teachers: Array<{ id: string; name: string; centre_id: string | null }>;
  currentUserRole: string;
  currentUserOrgId: string | null;
  currentUserCentreId: string | null;
}

const roleOptions: Record<string, Array<{ value: string; label: string }>> = {
  platform_admin: [
    { value: "org_admin", label: "Org Admin" },
    { value: "centre_admin", label: "Centre Admin" },
    { value: "teacher", label: "Teacher" },
    { value: "student", label: "Student" },
  ],
  org_admin: [
    { value: "centre_admin", label: "Centre Admin" },
    { value: "teacher", label: "Teacher" },
    { value: "student", label: "Student" },
  ],
  centre_admin: [
    { value: "teacher", label: "Teacher" },
    { value: "student", label: "Student" },
  ],
};

export function CreateUserForm({
  organizations,
  centres,
  teachers,
  currentUserRole,
  currentUserOrgId,
  currentUserCentreId,
}: CreateUserFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState("student");
  const [selectedOrgId, setSelectedOrgId] = useState(currentUserOrgId || "");
  const [selectedCentreId, setSelectedCentreId] = useState(currentUserCentreId || "");

  const filteredCentres = centres.filter((c) => c.org_id === selectedOrgId);
  const filteredTeachers = teachers.filter((t) => t.centre_id === selectedCentreId);
  const showClass = selectedRole === "student" || selectedRole === "teacher";
  const showTeacher = selectedRole === "student";
  const availableRoles = roleOptions[currentUserRole] ?? [];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await createUser(formData);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      setOpen(false);
      setLoading(false);
      setError(null);
    }
  }

  if (!open) {
    return (
      <ClayButton onClick={() => setOpen(true)} size="sm">
        <Plus className="w-4 h-4" /> Add User
      </ClayButton>
    );
  }

  return (
    <ClayCard hover={false} className="!p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-poppins font-bold text-heading text-sm">New User</h3>
        <button onClick={() => setOpen(false)} className="text-muted hover:text-heading">
          <X className="w-4 h-4" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <ClayInput id="user-name" name="name" label="Full Name" placeholder="Student/teacher name" required />
          <ClayInput id="user-email" name="email" type="email" label="Email (Login ID)" placeholder="user@example.com" required />
          <ClayInput id="user-phone" name="phone" label="Phone" placeholder="Phone number" />
          <ClayInput id="user-password" name="password" type="text" label="Password" placeholder="Initial password" required />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-semibold text-heading font-poppins mb-2">Role</label>
            <select name="role" required className="clay-input w-full" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
              {availableRoles.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-heading font-poppins mb-2">Organization *</label>
            <select
              name="org_id"
              required
              className="clay-input w-full"
              value={selectedOrgId}
              onChange={(e) => { setSelectedOrgId(e.target.value); setSelectedCentreId(""); }}
              disabled={currentUserRole !== "platform_admin"}
            >
              <option value="">Select organization</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-heading font-poppins mb-2">
              Centre {selectedRole !== "org_admin" ? "*" : ""}
            </label>
            <select
              name="centre_id"
              required={selectedRole !== "org_admin"}
              className="clay-input w-full"
              value={selectedCentreId}
              onChange={(e) => setSelectedCentreId(e.target.value)}
              disabled={currentUserRole === "centre_admin"}
            >
              <option value="">{selectedRole === "org_admin" ? "None (org-level)" : "Select centre"}</option>
              {filteredCentres.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {showTeacher && (
            <div>
              <label className="block text-sm font-semibold text-heading font-poppins mb-2">Teacher</label>
              <select name="teacher_id" className="clay-input w-full">
                <option value="">None</option>
                {filteredTeachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {showClass && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-heading font-poppins mb-2">Class</label>
              <select name="class" className="clay-input w-full">
                <option value="">None</option>
                <option value="0">KG</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>Class {i + 1}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-heading font-poppins mb-2">Board</label>
              <select name="board" className="clay-input w-full">
                <option value="">None</option>
                <option value="CBSE">CBSE</option>
                <option value="State">State Board</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-heading font-poppins mb-2">Medium</label>
              <select name="medium" className="clay-input w-full">
                <option value="">None</option>
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
              </select>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
        <ClayButton type="submit" loading={loading} size="sm">Create User</ClayButton>
      </form>
    </ClayCard>
  );
}
