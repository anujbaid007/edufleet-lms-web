"use client";

import { useState } from "react";
import { ClayButton } from "@/components/ui/clay-button";
import { ClayInput } from "@/components/ui/clay-input";
import { ClayCard } from "@/components/ui/clay-card";
import { createCentre } from "@/lib/actions/admin";
import { Plus, X } from "lucide-react";

interface CreateCentreFormProps {
  organizations: Array<{ id: string; name: string }>;
  defaultOrgId?: string;
}

export function CreateCentreForm({ organizations, defaultOrgId }: CreateCentreFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await createCentre(formData);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      setOpen(false);
      setLoading(false);
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
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
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
        {error && <p className="w-full text-sm text-red-500">{error}</p>}
        <ClayButton type="submit" loading={loading} size="sm">Create</ClayButton>
      </form>
    </ClayCard>
  );
}
