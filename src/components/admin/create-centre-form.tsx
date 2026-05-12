"use client";

import { useState } from "react";
import { ClayButton } from "@/components/ui/clay-button";
import { ClayInput } from "@/components/ui/clay-input";
import { ClayCard } from "@/components/ui/clay-card";
import { createCentre } from "@/lib/actions/admin";
import { Plus, X, Wifi, WifiOff } from "lucide-react";

interface CreateCentreFormProps {
  organizations: Array<{ id: string; name: string }>;
  defaultOrgId?: string;
}

function classLabel(c: number) {
  return c === 0 ? "KG" : `Class ${c}`;
}

const ALL_CLASSES = Array.from({ length: 13 }, (_, i) => i);

export function CreateCentreForm({ organizations, defaultOrgId }: CreateCentreFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"online" | "offline">("online");
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.set("mode", mode);
    if (mode === "offline" && Object.keys(studentCounts).length > 0) {
      formData.set("offline_student_counts", JSON.stringify(studentCounts));
    }
    const result = await createCentre(formData);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      setOpen(false);
      setLoading(false);
      setMode("online");
      setStudentCounts({});
    }
  }

  if (!open) {
    return (
      <ClayButton onClick={() => setOpen(true)} size="sm">
        <Plus className="w-4 h-4" /> Add Centre
      </ClayButton>
    );
  }

  return (
    <ClayCard hover={false} className="!p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-poppins font-bold text-heading text-sm">New Centre</h3>
        <button onClick={() => setOpen(false)} className="text-muted hover:text-heading">
          <X className="w-4 h-4" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <ClayInput id="centre-name" name="name" label="Centre Name" placeholder="Centre name" required />
          </div>
          <div className="w-56">
            <label className="block text-sm font-semibold text-heading font-poppins mb-2">Organization</label>
            <select name="org_id" required className="clay-input w-full" defaultValue={defaultOrgId || ""}>
              <option value="" disabled>Select org</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </div>
          <div className="w-48">
            <ClayInput id="centre-location" name="location" label="Location" placeholder="Optional" />
          </div>
          <div className="w-44">
            <label className="block text-sm font-semibold text-heading font-poppins mb-2">Mode</label>
            <div className="flex rounded-2xl border border-orange-primary/20 overflow-hidden h-[42px]">
              <button
                type="button"
                onClick={() => { setMode("online"); setStudentCounts({}); }}
                className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors ${
                  mode === "online"
                    ? "bg-green-500 text-white"
                    : "bg-white/90 text-muted hover:bg-green-50"
                }`}
              >
                <Wifi className="w-3.5 h-3.5" /> Online
              </button>
              <button
                type="button"
                onClick={() => setMode("offline")}
                className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors ${
                  mode === "offline"
                    ? "bg-amber-500 text-white"
                    : "bg-white/90 text-muted hover:bg-amber-50"
                }`}
              >
                <WifiOff className="w-3.5 h-3.5" /> Offline
              </button>
            </div>
          </div>
        </div>

        {mode === "offline" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-heading">Students per Class</p>
              {totalOfflineStudents > 0 && (
                <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                  Total: {totalOfflineStudents} students
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
              {ALL_CLASSES.map((c) => (
                <div key={c}>
                  <label className="block text-xs font-medium text-muted mb-1">{classLabel(c)}</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={studentCounts[String(c)] ?? ""}
                    onChange={(e) => updateCount(c, e.target.value)}
                    className="w-full h-9 rounded-xl border border-amber-200 bg-white px-3 text-sm text-heading outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              Offline centres use pen drives for content delivery. Only teachers will have login accounts.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
        <ClayButton type="submit" loading={loading} size="sm">Create</ClayButton>
      </form>
    </ClayCard>
  );
}
