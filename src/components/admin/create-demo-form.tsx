"use client";

import { useState } from "react";
import { ClayButton } from "@/components/ui/clay-button";
import { ClayInput } from "@/components/ui/clay-input";
import { ClayCard } from "@/components/ui/clay-card";
import { createDemoUser } from "@/lib/actions/demo";
import { Plus, X, Copy, Check } from "lucide-react";

function classLabel(c: number) {
  return c === 0 ? "KG" : `Class ${c}`;
}

export function CreateDemoForm({ classOptions }: { classOptions: number[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await createDemoUser(new FormData(e.currentTarget));
    setLoading(false);
    if (result.success) {
      setCreds({ email: result.email, password: result.password });
    } else {
      setError(result.error ?? "Something went wrong");
    }
  }

  function reset() {
    setOpen(false);
    setError(null);
    setCreds(null);
    setCopied(false);
  }

  if (!open) {
    return (
      <ClayButton onClick={() => setOpen(true)} size="sm">
        <Plus className="w-4 h-4" /> New Demo Link
      </ClayButton>
    );
  }

  if (creds) {
    const text = `EduFleet demo login\nEmail: ${creds.email}\nPassword: ${creds.password}`;
    return (
      <ClayCard hover={false} className="!p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-poppins font-bold text-heading text-sm">Demo login created</h3>
          <button onClick={reset} className="text-muted hover:text-heading"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-muted mb-3">Copy and share these credentials now — the password is shown only once.</p>
        <div className="rounded-clay-sm bg-cream/70 p-3 text-sm">
          <p><span className="text-muted">Email:</span> <span className="font-semibold">{creds.email}</span></p>
          <p><span className="text-muted">Password:</span> <span className="font-mono font-semibold">{creds.password}</span></p>
        </div>
        <div className="mt-4 flex gap-2">
          <ClayButton
            size="sm"
            onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); }}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? "Copied" : "Copy"}
          </ClayButton>
          <ClayButton size="sm" variant="ghost" onClick={reset}>Done</ClayButton>
        </div>
      </ClayCard>
    );
  }

  return (
    <ClayCard hover={false} className="!p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-poppins font-bold text-heading text-sm">New Demo Link</h3>
        <button onClick={reset} className="text-muted hover:text-heading"><X className="w-4 h-4" /></button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ClayInput id="demo-client" name="client_name" label="Client Name" placeholder="Acme Foundation" required />
          <ClayInput id="demo-email" name="email" type="email" label="Client Email (Login ID)" placeholder="client@example.com" required />
          <ClayInput id="demo-phone" name="phone" label="Client Phone" placeholder="Phone number" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-heading font-poppins mb-2">License Validity</label>
            <select name="license_months" className="clay-input w-full" defaultValue="1">
              <option value="1">1 month</option>
              <option value="2">2 months</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-heading font-poppins mb-2">Initial Class</label>
            <select name="class" className="clay-input w-full" required defaultValue="">
              <option value="" disabled>Select class</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>{classLabel(c)}</option>
              ))}
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <ClayButton type="submit" loading={loading} size="sm">Create Demo Login</ClayButton>
      </form>
    </ClayCard>
  );
}
