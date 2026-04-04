"use client";

import { useState } from "react";
import { Pencil, Trash2, X, Check, Loader2 } from "lucide-react";
import { updateCentre, deleteCentre } from "@/lib/actions/admin";
import { useRouter } from "next/navigation";

interface Props {
  centre: { id: string; name: string; location: string | null; is_active: boolean };
}

export function EditCentreRow({ centre }: Props) {
  const [mode, setMode] = useState<"view" | "edit" | "confirmDelete">("view");
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(centre.name);
  const [location, setLocation] = useState(centre.location ?? "");
  const router = useRouter();

  async function handleSave() {
    setLoading(true);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("location", location);
    fd.set("is_active", String(centre.is_active));
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
    <div className="flex items-center gap-2 shrink-0">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-36 px-2.5 py-1.5 text-sm border border-orange-primary/30 rounded-lg focus:outline-none focus:border-orange-primary"
        placeholder="Name"
        autoFocus
      />
      <input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        className="w-32 px-2.5 py-1.5 text-sm border border-orange-primary/30 rounded-lg focus:outline-none focus:border-orange-primary"
        placeholder="Location"
      />
      <button
        onClick={handleSave}
        disabled={loading}
        className="p-2 rounded-lg text-green-600 hover:bg-green-50 transition-all"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      </button>
      <button
        onClick={() => { setMode("view"); setName(centre.name); setLocation(centre.location ?? ""); }}
        className="p-2 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition-all"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
