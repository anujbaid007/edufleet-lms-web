"use client";

import { useState } from "react";
import { Pencil, X, Check, Loader2 } from "lucide-react";
import { updateOrganization } from "@/lib/actions/admin";
import { useRouter } from "next/navigation";

interface EditOrgRowProps {
  org: { id: string; name: string; type: string; is_active: boolean };
}

export function EditOrgRow({ org }: EditOrgRowProps) {
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(org.name);
  const [type, setType] = useState(org.type);
  const [isActive, setIsActive] = useState(org.is_active);
  const router = useRouter();

  async function handleSave() {
    setLoading(true);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("type", type);
    fd.set("is_active", String(isActive));
    const result = await updateOrganization(org.id, fd);
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
        title="Edit organization"
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
          placeholder="Name"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-clay-sm clay-input"
        >
          <option value="ngo">NGO</option>
          <option value="csr">CSR</option>
        </select>
      </div>
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
