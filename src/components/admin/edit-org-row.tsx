"use client";

import { useState } from "react";
import { Pencil, Trash2, X, Check, Loader2 } from "lucide-react";
import { updateOrganization, deleteOrganization } from "@/lib/actions/admin";
import { useRouter } from "next/navigation";

interface Props {
  org: { id: string; name: string; type: string; is_active: boolean };
}

export function EditOrgRow({ org }: Props) {
  const [mode, setMode] = useState<"view" | "edit" | "confirmDelete">("view");
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(org.name);
  const [type, setType] = useState(org.type);
  const router = useRouter();

  async function handleSave() {
    setLoading(true);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("type", type);
    fd.set("is_active", String(org.is_active));
    await updateOrganization(org.id, fd);
    setLoading(false);
    setMode("view");
    router.refresh();
  }

  async function handleDelete() {
    setLoading(true);
    const result = await deleteOrganization(org.id);
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

  // Edit mode
  return (
    <div className="flex items-center gap-2 shrink-0">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-40 px-2.5 py-1.5 text-sm border border-orange-primary/30 rounded-lg focus:outline-none focus:border-orange-primary"
        placeholder="Name"
        autoFocus
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="px-2.5 py-1.5 text-sm border border-orange-primary/30 rounded-lg focus:outline-none focus:border-orange-primary"
      >
        <option value="ngo">NGO</option>
        <option value="csr">CSR</option>
      </select>
      <button
        onClick={handleSave}
        disabled={loading}
        className="p-2 rounded-lg text-green-600 hover:bg-green-50 transition-all"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      </button>
      <button
        onClick={() => { setMode("view"); setName(org.name); setType(org.type); }}
        className="p-2 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition-all"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
