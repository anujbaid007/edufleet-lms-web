"use client";

import { useState } from "react";
import { Pencil, Trash2, X, Check, Loader2 } from "lucide-react";
import { updateUser, deleteUser } from "@/lib/actions/admin";
import { useRouter } from "next/navigation";

interface Props {
  user: {
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
  };
  organizations: { id: string; name: string }[];
  centres: { id: string; name: string; org_id: string }[];
  teachers: { id: string; name: string; centre_id: string | null }[];
}

export function EditUserRow({ user, organizations, centres, teachers }: Props) {
  const [mode, setMode] = useState<"view" | "edit" | "confirmDelete">("view");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [password, setPassword] = useState("");
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
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("email", email);
    fd.set("phone", phone);
    if (password) fd.set("password", password);
    fd.set("role", role);
    fd.set("org_id", orgId);
    fd.set("centre_id", centreId);
    fd.set("teacher_id", teacherId);
    if (classNum) fd.set("class", classNum);
    if (board) fd.set("board", board);
    if (medium) fd.set("medium", medium);
    fd.set("is_active", String(user.is_active));
    const result = await updateUser(user.id, fd);
    setLoading(false);
    if (result?.error) {
      setError(result.error);
    } else {
      setPassword("");
      setMode("view");
      router.refresh();
    }
  }

  async function handleDelete() {
    setLoading(true);
    const result = await deleteUser(user.id);
    setLoading(false);
    if (result?.error) {
      alert(result.error);
    } else {
      router.refresh();
    }
  }

  function resetFields() {
    setName(user.name);
    setEmail(user.email);
    setPhone(user.phone ?? "");
    setPassword("");
    setRole(user.role);
    setOrgId(user.org_id ?? "");
    setCentreId(user.centre_id ?? "");
    setTeacherId(user.teacher_id ?? "");
    setClassNum(user.class?.toString() ?? "");
    setBoard(user.board ?? "");
    setMedium(user.medium ?? "");
    setError(null);
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
        <button
          onClick={() => setMode("confirmDelete")}
          className="p-2 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition-all"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (mode === "confirmDelete") {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-red-600 font-medium">Delete permanently?</span>
        <button
          onClick={handleDelete}
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

  const inputClass = "w-full px-2.5 py-1.5 text-sm border border-orange-primary/30 rounded-lg focus:outline-none focus:border-orange-primary";

  return (
    <div className="mt-2 p-4 rounded-xl bg-cream/60 border border-orange-primary/10 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-heading">Edit User</span>
        <div className="flex gap-1">
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-1"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Save
          </button>
          <button
            onClick={resetFields}
            className="px-3 py-1.5 text-xs font-medium text-body bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Cancel
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Row 1: Identity */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className="text-[10px] font-semibold text-muted uppercase">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Name" autoFocus />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted uppercase">Email (Login)</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="Email" type="email" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted uppercase">Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="Phone number" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted uppercase">New Password</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="Leave blank to keep" type="text" />
        </div>
      </div>

      {/* Row 2: Role & Org */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className="text-[10px] font-semibold text-muted uppercase">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
            <option value="centre_admin">Centre Admin</option>
            <option value="org_admin">Org Admin</option>
            <option value="platform_admin">Platform Admin</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted uppercase">Organization</label>
          <select value={orgId} onChange={(e) => { setOrgId(e.target.value); setCentreId(""); setTeacherId(""); }} className={inputClass}>
            <option value="">No org</option>
            {organizations.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted uppercase">Centre</label>
          <select value={centreId} onChange={(e) => { setCentreId(e.target.value); setTeacherId(""); }} className={inputClass}>
            <option value="">No centre</option>
            {filteredCentres.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </div>
        {role === "student" && (
          <div>
            <label className="text-[10px] font-semibold text-muted uppercase">Teacher</label>
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={inputClass}>
              <option value="">No teacher</option>
              {filteredTeachers.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
          </div>
        )}
      </div>

      {/* Row 3: Academic (students & teachers) */}
      {(role === "student" || role === "teacher") && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] font-semibold text-muted uppercase">Class</label>
            <select value={classNum} onChange={(e) => setClassNum(e.target.value)} className={inputClass}>
              <option value="">None</option>
              <option value="0">KG</option>
              {Array.from({ length: 12 }, (_, i) => (<option key={i + 1} value={String(i + 1)}>Class {i + 1}</option>))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted uppercase">Board</label>
            <select value={board} onChange={(e) => setBoard(e.target.value)} className={inputClass}>
              <option value="">None</option>
              <option value="CBSE">CBSE</option>
              <option value="State">State</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted uppercase">Medium</label>
            <select value={medium} onChange={(e) => setMedium(e.target.value)} className={inputClass}>
              <option value="">None</option>
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
