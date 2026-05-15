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

const ALL_CLASSES = Array.from({ length: 13 }, (_, i) => i); // 0 (KG) through 12

function classLabel(c: number) {
  return c === 0 ? "KG" : `Class ${c}`;
}

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
  const [selectedClasses, setSelectedClasses] = useState<number[]>([]);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);

  const filteredCentres = centres.filter((c) => c.org_id === selectedOrgId);
  const filteredTeachers = teachers.filter((t) => t.centre_id === selectedCentreId);
  const showAcademicDetails = selectedRole === "student" || selectedRole === "teacher";
  const showTeachers = selectedRole === "student";
  const availableRoles = roleOptions[currentUserRole] ?? [];

  function toggleClass(c: number) {
    setSelectedClasses((prev) =>
      prev.includes(c) ? prev.filter((v) => v !== c) : [...prev, c]
    );
  }

  function toggleAllClasses() {
    setSelectedClasses((prev) =>
      prev.length === ALL_CLASSES.length ? [] : [...ALL_CLASSES]
    );
  }

  function toggleTeacher(id: string) {
    setSelectedTeacherIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    if (selectedRole === "teacher") {
      formData.set("classes", selectedClasses.join(","));
    }
    if (selectedRole === "student") {
      formData.set("teacher_ids", selectedTeacherIds.join(","));
    }
    const result = await createUser(formData);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      setOpen(false);
      setLoading(false);
      setError(null);
      setSelectedClasses([]);
      setSelectedTeacherIds([]);
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <ClayInput id="user-name" name="name" label="Full Name" placeholder="Student/teacher name" required />
          <ClayInput id="user-email" name="email" type="email" label="Email (Login ID)" placeholder="user@example.com" required />
          <ClayInput id="user-phone" name="phone" label="Phone" placeholder="Phone number" />
          <ClayInput id="user-password" name="password" type="text" label="Password" placeholder="Initial password" required />
          <div>
            <label className="block text-sm font-semibold text-heading font-poppins mb-2">Licence Until</label>
            <input
              type="date"
              name="license_valid_until"
              className="clay-input w-full"
            />
            <p className="text-[11px] text-muted mt-1">Empty = inherit</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-semibold text-heading font-poppins mb-2">Role</label>
            <select name="role" required className="clay-input w-full" value={selectedRole} onChange={(e) => { setSelectedRole(e.target.value); setSelectedClasses([]); setSelectedTeacherIds([]); }}>
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
              onChange={(e) => { setSelectedOrgId(e.target.value); setSelectedCentreId(""); setSelectedTeacherIds([]); }}
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
              onChange={(e) => { setSelectedCentreId(e.target.value); setSelectedTeacherIds([]); }}
              disabled={currentUserRole === "centre_admin"}
            >
              <option value="">{selectedRole === "org_admin" ? "None (org-level)" : "Select centre"}</option>
              {filteredCentres.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {showTeachers && (
            <div>
              <label className="block text-sm font-semibold text-heading font-poppins mb-2">Teachers</label>
              <div className="clay-input w-full max-h-32 overflow-y-auto !p-2 space-y-1">
                {filteredTeachers.length === 0 ? (
                  <p className="text-xs text-muted px-1">No teachers in this centre</p>
                ) : (
                  filteredTeachers.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-orange-50/60 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={selectedTeacherIds.includes(t.id)}
                        onChange={() => toggleTeacher(t.id)}
                        className="accent-orange-500"
                      />
                      <span className="truncate">{t.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {showAcademicDetails && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {selectedRole === "student" && (
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
            )}
            {selectedRole === "teacher" && (
              <div>
                <label className="block text-sm font-semibold text-heading font-poppins mb-2">Classes</label>
                <div className="clay-input w-full max-h-32 overflow-y-auto !p-2 space-y-1">
                  <label className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-orange-50/60 cursor-pointer text-sm font-semibold text-orange-primary">
                    <input
                      type="checkbox"
                      checked={selectedClasses.length === ALL_CLASSES.length}
                      onChange={toggleAllClasses}
                      className="accent-orange-500"
                    />
                    ALL Classes
                  </label>
                  {ALL_CLASSES.map((c) => (
                    <label key={c} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-orange-50/60 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={selectedClasses.includes(c)}
                        onChange={() => toggleClass(c)}
                        className="accent-orange-500"
                      />
                      {classLabel(c)}
                    </label>
                  ))}
                </div>
                {selectedClasses.length > 0 && (
                  <p className="text-xs text-muted mt-1">
                    {selectedClasses.length === ALL_CLASSES.length
                      ? "All classes selected"
                      : `${selectedClasses.length} class${selectedClasses.length > 1 ? "es" : ""} selected`}
                  </p>
                )}
              </div>
            )}
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
