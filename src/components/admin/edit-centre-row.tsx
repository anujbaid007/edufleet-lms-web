"use client";

import { useState } from "react";
import { Pencil, X, Check, Loader2 } from "lucide-react";
import { updateCentre } from "@/lib/actions/admin";
import { useRouter } from "next/navigation";

interface EditCentreRowProps {
  centre: { id: string; name: string; location: string | null; is_active: boolean; org_id: string };
  organizations: { id: string; name: string }[];
}

export function EditCentreRow({ centre, organizations }: EditCentreRowProps) {
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(centre.name);
  const [location, setLocation] = useState(centre.location ?? "");
  const [orgId, setOrgId] = useState(centre.org_id);
  const [isActive, setIsActive] = useState(centre.is_active);
  const router = useRouter();

  async function handleSave() {
    setLoading(true);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("location", location);
    fd.set("org_id", orgId);
    fd.set("is_active", String(isActive));
    const result = await updateCentre(centre.id, fd);
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
        title="Edit centre"
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
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="flex-1 px-3 py-1.5 text-sm rounded-clay-sm clay-input"
          placeholder="Location"
        />
      </div>
      <div className="flex gap-2">
        <select
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          className="flex-1 px-3 py-1.5 text-sm rounded-clay-sm clay-input"
        >
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
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
