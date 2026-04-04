"use client";

import { useState } from "react";
import { Pencil, X, Check, Loader2 } from "lucide-react";
import { updateUser } from "@/lib/actions/admin";
import { useRouter } from "next/navigation";

interface EditUserRowProps {
  user: {
    id: string;
    name: string;
    role: string;
    org_id: string | null;
    centre_id: string | null;
    teacher_id: string | null;
    class: number | null;
    board: string | null;
    medium: string | null;
    is_active: boolean;
  };
  organizations: { id: string; name: string }[];
  centres: { id: string; name: string; org_id: string }[];
  teachers: { id: string; name: string; centre_id: string | null }[];
}

export function EditUserRow({ user, organizations, centres, teachers }: EditUserRowProps) {
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [orgId, setOrgId] = useState(user.org_id ?? "");
  const [centreId, setCentreId] = useState(user.centre_id ?? "");
  const [teacherId, setTeacherId] = useState(user.teacher_id ?? "");
  const [classNum, setClassNum] = useState(user.class?.toString() ?? "");
  const [board, setBoard] = useState(user.board ?? "");
  const [medium, setMedium] = useState(user.medium ?? "");
  const [isActive, setIsActive] = useState(user.is_active);
  const router = useRouter();

  const filteredCentres = orgId ? centres.filter((c) => c.org_id === orgId) : centres;
  const filteredTeachers = centreId ? teachers.filter((t) => t.centre_id === centreId) : teachers;
  const isStudent = role === "student";
  const isTeacher = role === "teacher";

  async function handleSave() {
    setLoading(true);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("role", role);
    fd.set("org_id", orgId);
    fd.set("centre_id", centreId);
    fd.set("teacher_id", teacherId);
    if (classNum) fd.set("class", classNum);
    if (board) fd.set("board", board);
    if (medium) fd.set("medium", medium);
    fd.set("is_active", String(isActive));
    const result = await updateUser(user.id, fd);
    setLoading(false);
    if (!result?.error) {
      setEditing(false);
      router.refresh();
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="p-1.5 rounded-clay-sm text-muted hover:text-orange-primary hover:bg-orange-50 transition-all"
        title="Edit user"
      >
        <Pencil className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-orange-primary/10 space-y-3">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 px-3 py-1.5 text-sm rounded-clay-sm clay-input"
          placeholder="Full name"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-clay-sm clay-input"
        >
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
          <option value="centre_admin">Centre Admin</option>
          <option value="org_admin">Org Admin</option>
          <option value="platform_admin">Platform Admin</option>
        </select>
      </div>
      <div className="flex gap-2">
        <select
          value={orgId}
          onChange={(e) => { setOrgId(e.target.value); setCentreId(""); setTeacherId(""); }}
          className="flex-1 px-3 py-1.5 text-sm rounded-clay-sm clay-input"
        >
          <option value="">No org</option>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <select
          value={centreId}
          onChange={(e) => { setCentreId(e.target.value); setTeacherId(""); }}
          className="flex-1 px-3 py-1.5 text-sm rounded-clay-sm clay-input"
        >
          <option value="">No centre</option>
          {filteredCentres.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      {(isStudent || isTeacher) && (
        <div className="flex gap-2">
          {isStudent && (
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm rounded-clay-sm clay-input"
            >
              <option value="">No teacher</option>
              {filteredTeachers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          <select
            value={classNum}
            onChange={(e) => setClassNum(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-clay-sm clay-input"
          >
            <option value="">Class</option>
            <option value="0">KG</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>Class {i + 1}</option>
            ))}
          </select>
          <select
            value={board}
            onChange={(e) => setBoard(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-clay-sm clay-input"
          >
            <option value="">Board</option>
            <option value="CBSE">CBSE</option>
            <option value="State">State</option>
          </select>
          <select
            value={medium}
            onChange={(e) => setMedium(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-clay-sm clay-input"
          >
            <option value="">Medium</option>
            <option value="english">English</option>
            <option value="hindi">Hindi</option>
          </select>
        </div>
      )}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-body">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded"
          />
          Active
        </label>
        <div className="flex gap-1.5">
          <button
            onClick={() => setEditing(false)}
            className="p-1.5 rounded-clay-sm text-muted hover:text-red-500 hover:bg-red-50 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="p-1.5 rounded-clay-sm text-muted hover:text-green-600 hover:bg-green-50 transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
