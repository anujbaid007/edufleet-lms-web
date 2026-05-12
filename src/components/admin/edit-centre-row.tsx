"use client";

import { useState } from "react";
import { Pencil, Trash2, X, Check, Loader2, Wifi, WifiOff } from "lucide-react";
import { updateCentre, deleteCentre } from "@/lib/actions/admin";
import { useRouter } from "next/navigation";

function classLabel(c: number) {
  return c === 0 ? "KG" : `Class ${c}`;
}

const ALL_CLASSES = Array.from({ length: 13 }, (_, i) => i);

interface Props {
  centre: {
    id: string;
    name: string;
    location: string | null;
    is_active: boolean;
    mode: string;
    offline_student_counts: Record<string, number> | null;
  };
}

export function EditCentreRow({ centre }: Props) {
  const [mode, setMode] = useState<"view" | "edit" | "confirmDelete">("view");
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(centre.name);
  const [location, setLocation] = useState(centre.location ?? "");
  const [centreMode, setCentreMode] = useState<"online" | "offline">(
    (centre.mode as "online" | "offline") ?? "online"
  );
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>(
    (centre.offline_student_counts as Record<string, number>) ?? {}
  );
  const router = useRouter();

  function updateCount(classNum: number, value: string) {
    const num = parseInt(value, 10);
    setStudentCounts((prev) => {
      const next = { ...prev };
      if (!value || num <= 0) {
        delete next[String(classNum)];
      } else {
        next[String(classNum)] = num;
      }
      return next;
    });
  }

  const totalOfflineStudents = Object.values(studentCounts).reduce((sum, c) => sum + c, 0);

  async function handleSave() {
    setLoading(true);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("location", location);
    fd.set("is_active", String(centre.is_active));
    fd.set("mode", centreMode);
    if (centreMode === "offline" && Object.keys(studentCounts).length > 0) {
      fd.set("offline_student_counts", JSON.stringify(studentCounts));
    }
    await updateCentre(centre.id, fd);
    setLoading(false);
    setMode("view");
    router.refresh();
  }

  async function handleDelete() {
    setLoading(true);
    const result = await deleteCentre(centre.id);
    setLoading(false);
    if (result?.error) {
      alert(result.error);
      setMode("view");
    } else {
      router.refresh();
    }
  }

  function resetFields() {
    setName(centre.name);
    setLocation(centre.location ?? "");
    setCentreMode((centre.mode as "online" | "offline") ?? "online");
    setStudentCounts((centre.offline_student_counts as Record<string, number>) ?? {});
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
        <span className="text-xs text-red-600 font-medium">Delete?</span>
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

  return (
    <div className="mt-3 rounded-2xl border border-orange-primary/15 bg-gradient-to-br from-[#fffaf4] via-white to-[#fff5ea] p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-40 px-2.5 py-1.5 text-sm border border-orange-primary/30 rounded-lg focus:outline-none focus:border-orange-primary"
          placeholder="Name"
          autoFocus
        />
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-32 px-2.5 py-1.5 text-sm border border-orange-primary/30 rounded-lg focus:outline-none focus:border-orange-primary"
          placeholder="Location"
        />
        <div className="flex rounded-lg border border-orange-primary/20 overflow-hidden h-[34px]">
          <button
            type="button"
            onClick={() => { setCentreMode("online"); setStudentCounts({}); }}
            className={`px-2.5 flex items-center gap-1 text-xs font-medium transition-colors ${
              centreMode === "online" ? "bg-green-500 text-white" : "bg-white text-muted hover:bg-green-50"
            }`}
          >
            <Wifi className="w-3 h-3" /> Online
          </button>
          <button
            type="button"
            onClick={() => setCentreMode("offline")}
            className={`px-2.5 flex items-center gap-1 text-xs font-medium transition-colors ${
              centreMode === "offline" ? "bg-amber-500 text-white" : "bg-white text-muted hover:bg-amber-50"
            }`}
          >
            <WifiOff className="w-3 h-3" /> Offline
          </button>
        </div>
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

      {centreMode === "offline" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-heading">Students per Class</p>
            {totalOfflineStudents > 0 && (
              <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                Total: {totalOfflineStudents}
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {ALL_CLASSES.map((c) => (
              <div key={c}>
                <label className="block text-[10px] font-medium text-muted mb-0.5">{classLabel(c)}</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={studentCounts[String(c)] ?? ""}
                  onChange={(e) => updateCount(c, e.target.value)}
                  className="w-full h-7 rounded-lg border border-amber-200 bg-white px-2 text-xs text-heading outline-none focus:border-amber-400"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
