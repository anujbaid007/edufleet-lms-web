"use client";

import { useState } from "react";
import { ClayButton } from "@/components/ui/clay-button";
import { ClayInput } from "@/components/ui/clay-input";
import { ClayCard } from "@/components/ui/clay-card";
import { createOrganization } from "@/lib/actions/admin";
import { Plus, X } from "lucide-react";

export function CreateOrgForm() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await createOrganization(formData);

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
        <Plus className="w-4 h-4" /> Add Organization
      </ClayButton>
    );
  }

  return (
    <ClayCard hover={false} className="!p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-poppins font-bold text-heading text-sm">New Organization</h3>
        <button onClick={() => setOpen(false)} className="text-muted hover:text-heading">
          <X className="w-4 h-4" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[200px]">
          <ClayInput id="name" name="name" label="Name" placeholder="Organization name" required />
        </div>
        <div className="w-40">
          <label className="block text-sm font-semibold text-heading font-poppins mb-2">Type</label>
          <select
            name="type"
            required
            className="clay-input w-full"
          >
            <option value="csr">CSR</option>
            <option value="ngo">NGO</option>
          </select>
        </div>
        {error && <p className="w-full text-sm text-red-500">{error}</p>}
        <ClayButton type="submit" loading={loading} size="sm">Create</ClayButton>
      </form>
    </ClayCard>
  );
}
