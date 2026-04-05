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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
      {children}
    </p>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-muted">{hint}</span> : null}
    </label>
  );
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
    const effectiveClassNum = role === "student" ? classNum : "";
    const fd = new FormData();
    fd.set("name", name);
    fd.set("email", email);
    fd.set("phone", phone);
    if (password) fd.set("password", password);
    fd.set("role", role);
    fd.set("org_id", orgId);
    fd.set("centre_id", centreId);
    fd.set("teacher_id", teacherId);
    if (effectiveClassNum) fd.set("class", effectiveClassNum);
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
      <div className="absolute right-0 top-0 flex gap-1">
        <button
          onClick={() => setMode("edit")}
          className="rounded-xl p-2 text-muted transition-all hover:bg-orange-50 hover:text-orange-primary"
          title="Edit"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => setMode("confirmDelete")}
          className="rounded-xl p-2 text-muted transition-all hover:bg-red-50 hover:text-red-500"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (mode === "confirmDelete") {
    return (
      <div className="absolute right-0 top-0 flex items-center gap-2 rounded-2xl border border-red-200 bg-white px-3 py-2 shadow-sm">
        <span className="text-xs font-medium text-red-600">Delete permanently?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="rounded-xl bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes"}
        </button>
        <button
          onClick={() => setMode("view")}
          className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-medium text-body transition-colors hover:bg-gray-200"
        >
          No
        </button>
      </div>
    );
  }

  const inputClass =
    "h-11 w-full rounded-2xl border border-orange-primary/20 bg-white/90 px-4 text-sm text-heading shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-orange-primary/60 focus:ring-4 focus:ring-orange-primary/10";
  const secondaryButtonClass =
    "inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50";
  const primaryButtonClass =
    "inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(16,185,129,0.25)] transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70";

  return (
    <div className="mt-4 rounded-[28px] border border-orange-primary/15 bg-gradient-to-br from-[#fffaf4] via-white to-[#fff5ea] p-5 shadow-[0_18px_44px_rgba(214,153,68,0.08)] sm:p-6">
      <div className="flex flex-col gap-4 border-b border-orange-primary/10 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="inline-flex items-center rounded-full bg-orange-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-primary">
            Edit User
          </div>
          <div>
            <h3 className="font-poppins text-xl font-bold text-heading">{name || user.name}</h3>
            <p className="mt-1 text-sm text-muted">
              Update login details, access scope, and academic mapping without leaving this list.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSave}
            disabled={loading}
            className={primaryButtonClass}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save
          </button>
          <button
            onClick={resetFields}
            className={secondaryButtonClass}
          >
            <X className="h-4 w-4" /> Cancel
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <section className="rounded-3xl border border-orange-primary/10 bg-white/75 p-5">
            <SectionLabel>Identity</SectionLabel>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Name">
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Full name" autoFocus />
              </Field>
              <Field label="Email (Login)">
                <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="Email address" type="email" />
              </Field>
              <Field label="Phone">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="Phone number" />
              </Field>
              <Field label="New Password" hint="Leave blank if you do not want to reset it.">
                <input value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="Temporary or new password" type="text" />
              </Field>
            </div>
          </section>

          <section className="rounded-3xl border border-orange-primary/10 bg-white/75 p-5">
            <SectionLabel>Access Mapping</SectionLabel>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Role">
                <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="centre_admin">Centre Admin</option>
                  <option value="org_admin">Org Admin</option>
                  <option value="platform_admin">Platform Admin</option>
                </select>
              </Field>
              <Field label="Organization">
                <select value={orgId} onChange={(e) => { setOrgId(e.target.value); setCentreId(""); setTeacherId(""); }} className={inputClass}>
                  <option value="">No org</option>
                  {organizations.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
                </select>
              </Field>
              <Field label="Centre">
                <select value={centreId} onChange={(e) => { setCentreId(e.target.value); setTeacherId(""); }} className={inputClass}>
                  <option value="">No centre</option>
                  {filteredCentres.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </Field>
              {role === "student" && (
                <Field label="Teacher">
                  <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={inputClass}>
                    <option value="">No teacher</option>
                    {filteredTeachers.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
                  </select>
                </Field>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-5">
          {(role === "student" || role === "teacher") && (
            <section className="rounded-3xl border border-orange-primary/10 bg-white/75 p-5">
              <SectionLabel>Academic Profile</SectionLabel>
              <div className={`mt-4 grid gap-4 ${role === "student" ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                {role === "student" && (
                  <Field label="Class">
                    <select value={classNum} onChange={(e) => setClassNum(e.target.value)} className={inputClass}>
                      <option value="">None</option>
                      <option value="0">KG</option>
                      {Array.from({ length: 12 }, (_, i) => (<option key={i + 1} value={String(i + 1)}>Class {i + 1}</option>))}
                    </select>
                  </Field>
                )}
                <Field label="Board">
                  <select value={board} onChange={(e) => setBoard(e.target.value)} className={inputClass}>
                    <option value="">None</option>
                    <option value="CBSE">CBSE</option>
                    <option value="State">State</option>
                  </select>
                </Field>
                <Field label="Medium">
                  <select value={medium} onChange={(e) => setMedium(e.target.value)} className={inputClass}>
                    <option value="">None</option>
                    <option value="English">English</option>
                    <option value="Hindi">Hindi</option>
                  </select>
                </Field>
              </div>
            </section>
          )}

          <section className="rounded-3xl border border-orange-primary/10 bg-[#fff8f0] p-5">
            <SectionLabel>Quick Notes</SectionLabel>
            <ul className="mt-4 space-y-3 text-sm text-muted">
              <li>Teachers are no longer assigned a single class from this editor.</li>
              <li>Students can still be mapped to a teacher and a class for progress tracking.</li>
              <li>Password changes are optional and only apply when you enter a new value.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
