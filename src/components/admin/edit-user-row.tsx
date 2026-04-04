"use client";

import { useState } from "react";
import { Pencil, Trash2, X, Check, Loader2 } from "lucide-react";
import { updateUser, deactivateUser } from "@/lib/actions/admin";
import { useRouter } from "next/navigation";

interface Props {
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

export function EditUserRow({ user, organizations, centres, teachers }: Props) {
  const [mode, setMode] = useState<"view" | "edit" | "confirmDelete">("view");
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [orgId, setOrgId] = useState(user.org_id ?? "");
  const [centreId, setCentreId] = useState(user.centre_id ?? "");
  const [teacherId, setTeacherId] = useState(user.teacher_id ?? "");
  const [classNum, setClassNum] = useState(user.class?.toString() ?? "");
  const [board, setBoard] = useState(user.board ?? "");
  const [medium, setMedium] = useState(user.medium ?? "");
  const router = useRouter();

  const filteredCentres = orgId ? centres.filter((c) => c.org_id === orgId) : centres;
  const filteredTeachers = centreId ? teachers.filter((t) => t.centre_id === centreId) : teachers;

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
    fd.set("is_active", String(user.is_active));
    await updateUser(user.id, fd);
    setLoading(false);
    setMode("view");
    router.refresh();
  }

  async function handleDeactivate() {
    setLoading(true);
    const result = await deactivateUser(user.id);
    setLoading(false);
    if (result?.error) {
      alert(result.error);
    }
    setMode("view");
    router.refresh();
  }

  function resetFields() {
    setName(user.name);
    setRole(user.role);
    setOrgId(user.org_id ?? "");
    setCentreId(user.centre_id ?? "");
    setTeacherId(user.teacher_id ?? "");
    setClassNum(user.class?.toString() ?? "");
    setBoard(user.board ?? "");
    setMedium(user.medium ?? "");
    setMode("view");
  }

  if (mode === "view") {
    return (
      <div className="flex gap-1 shrink-0">
        <button
          onClick={() => setMode("edit")}
          className="p-2 rounded-lg text-muted hover:text-orange-primary hover:bg-orange-50 transition-all"
          title="Edit"
        >
          <Pencil className="w-4 h-4" />
        </button>
        {user.is_active && (
          <button
            onClick={() => setMode("confirmDelete")}
            className="p-2 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition-all"
            title="Deactivate"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  if (mode === "confirmDelete") {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-red-600 font-medium">Deactivate?</span>
        <button
          onClick={handleDeactivate}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes"}
        </button>
        <button
          onClick={() => setMode("view")}
          className="px-3 py-1.5 text-xs font-medium text-body bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-32 px-2.5 py-1.5 text-sm border border-orange-primary/30 rounded-lg focus:outline-none focus:border-orange-primary"
        placeholder="Name"
        autoFocus
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="px-2.5 py-1.5 text-sm border border-orange-primary/30 rounded-lg focus:outline-none focus:border-orange-primary"
      >
        <option value="student">Student</option>
        <option value="teacher">Teacher</option>
        <option value="centre_admin">Centre Admin</option>
        <option value="org_admin">Org Admin</option>
        <option value="platform_admin">Platform Admin</option>
      </select>
      <select
        value={orgId}
        onChange={(e) => { setOrgId(e.target.value); setCentreId(""); setTeacherId(""); }}
        className="px-2.5 py-1.5 text-sm border border-orange-primary/30 rounded-lg focus:outline-none focus:border-orange-primary"
      >
        <option value="">No org</option>
        {organizations.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
      <select
        value={centreId}
        onChange={(e) => { setCentreId(e.target.value); setTeacherId(""); }}
        className="px-2.5 py-1.5 text-sm border border-orange-primary/30 rounded-lg focus:outline-none focus:border-orange-primary"
      >
        <option value="">No centre</option>
        {filteredCentres.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      {(role === "student" || role === "teacher") && (
        <>
          {role === "student" && (
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className="px-2.5 py-1.5 text-sm border border-orange-primary/30 rounded-lg focus:outline-none focus:border-orange-primary"
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
            className="px-2.5 py-1.5 text-sm border border-orange-primary/30 rounded-lg focus:outline-none focus:border-orange-primary"
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
            className="px-2.5 py-1.5 text-sm border border-orange-primary/30 rounded-lg focus:outline-none focus:border-orange-primary"
          >
            <option value="">Board</option>
            <option value="CBSE">CBSE</option>
            <option value="State">State</option>
          </select>
          <select
            value={medium}
            onChange={(e) => setMedium(e.target.value)}
            className="px-2.5 py-1.5 text-sm border border-orange-primary/30 rounded-lg focus:outline-none focus:border-orange-primary"
          >
            <option value="">Medium</option>
            <option value="english">English</option>
            <option value="hindi">Hindi</option>
          </select>
        </>
      )}
      <button
        onClick={handleSave}
        disabled={loading}
        className="p-2 rounded-lg text-green-600 hover:bg-green-50 transition-all"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      </button>
      <button
        onClick={resetFields}
        className="p-2 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition-all"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
