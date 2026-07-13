"use client";

import { useState, useTransition } from "react";
import { ClayCard } from "@/components/ui/clay-card";
import { setDemoLicense, deactivateDemoUser, deleteDemoUser } from "@/lib/actions/demo";
import { AlertTriangle, RefreshCw, Power, Trash2 } from "lucide-react";

export type DemoUserRow = {
  id: string;
  clientName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  licenseValidUntil: string | null;
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function StatusPill({ licenseValidUntil, isActive }: { licenseValidUntil: string | null; isActive: boolean }) {
  const days = daysUntil(licenseValidUntil);
  if (!isActive) {
    return <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700">Deactivated</span>;
  }
  if (days === null) {
    return <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">No expiry</span>;
  }
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700">
        <AlertTriangle className="h-3 w-3" /> Expired
      </span>
    );
  }
  if (days < 7) {
    return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Expiring · {days}d</span>;
  }
  return <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Active · {days}d</span>;
}

export function DemoUsersTable({ rows }: { rows: DemoUserRow[] }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function run(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    startTransition(async () => {
      await fn();
      setBusyId(null);
    });
  }

  if (rows.length === 0) {
    return <ClayCard hover={false} className="!p-6 text-center text-sm text-muted">No demo links yet.</ClayCard>;
  }

  return (
    <ClayCard hover={false} className="!p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-orange-primary/10 text-left text-xs text-muted">
            <th className="px-4 py-3 font-semibold">Client</th>
            <th className="px-4 py-3 font-semibold">Email</th>
            <th className="px-4 py-3 font-semibold">Phone</th>
            <th className="px-4 py-3 font-semibold">Created</th>
            <th className="px-4 py-3 font-semibold">Expiry</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-orange-primary/5 last:border-0">
              <td className="px-4 py-3 font-semibold text-heading">{r.clientName}</td>
              <td className="px-4 py-3 text-body">{r.email ?? "—"}</td>
              <td className="px-4 py-3 text-body">{r.phone ?? "—"}</td>
              <td className="px-4 py-3 text-body">{r.createdAt.slice(0, 10)}</td>
              <td className="px-4 py-3 text-body">{r.licenseValidUntil ?? "—"}</td>
              <td className="px-4 py-3"><StatusPill licenseValidUntil={r.licenseValidUntil} isActive={r.isActive} /></td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    title="Extend 1 month"
                    disabled={pending && busyId === r.id}
                    onClick={() => run(r.id, () => setDemoLicense(r.id, 1))}
                    className="rounded-lg p-2 text-body hover:bg-cream/80 hover:text-orange-primary disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button
                    title={r.isActive ? "Deactivate" : "Reactivate"}
                    disabled={pending && busyId === r.id}
                    onClick={() => run(r.id, () => deactivateDemoUser(r.id, !r.isActive))}
                    className="rounded-lg p-2 text-body hover:bg-cream/80 hover:text-orange-primary disabled:opacity-50"
                  >
                    <Power className="h-4 w-4" />
                  </button>
                  <button
                    title="Delete demo"
                    disabled={pending && busyId === r.id}
                    onClick={() => { if (confirm(`Delete demo for ${r.clientName}? This removes the login and its org.`)) run(r.id, () => deleteDemoUser(r.id)); }}
                    className="rounded-lg p-2 text-body hover:bg-red-50/80 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ClayCard>
  );
}
