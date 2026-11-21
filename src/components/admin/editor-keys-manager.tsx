"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClayButton } from "@/components/ui/clay-button";
import { ClayInput } from "@/components/ui/clay-input";
import { ClayCard } from "@/components/ui/clay-card";
import { createEditorKey, freeEditorKeyPc, setEditorKeyRevoked, type EditorKey } from "@/lib/actions/editor-keys";
import { Plus, X, Copy, Check, Monitor, KeyRound } from "lucide-react";

const fmt = (s: string) =>
  new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <ClayButton size="sm" variant="ghost" onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      {done ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {done ? "Copied" : label}
    </ClayButton>
  );
}

function CreateKeyForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const reset = () => { setOpen(false); setError(null); setCreated(null); };

  if (!open) {
    return (
      <ClayButton size="sm" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" /> New Editor Key
      </ClayButton>
    );
  }
  if (created) {
    return (
      <ClayCard hover={false} className="!p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-poppins font-bold text-heading text-sm">Editor key created</h3>
          <button onClick={reset} className="text-muted hover:text-heading" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-muted mb-3">Share it with the customer. It works on one PC: LFX Editor asks for it the first time it opens.</p>
        <div className="rounded-clay-sm bg-cream/70 p-3 font-mono text-base font-semibold tracking-wide text-heading break-all">{created}</div>
        <div className="mt-4 flex gap-2">
          <CopyButton text={created} label="Copy key" />
          <ClayButton size="sm" variant="ghost" onClick={reset}>Done</ClayButton>
        </div>
      </ClayCard>
    );
  }
  return (
    <ClayCard hover={false} className="!p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-poppins font-bold text-heading text-sm">New Editor Key</h3>
        <button onClick={reset} className="text-muted hover:text-heading" aria-label="Close"><X className="w-4 h-4" /></button>
      </div>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true); setError(null);
          const r = await createEditorKey(new FormData(e.currentTarget));
          setLoading(false);
          if ("key" in r) { setCreated(r.key); router.refresh(); } else setError(r.error);
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ClayInput id="ek-customer" name="customer" label="Customer" placeholder="LFX - editor name" required />
          <ClayInput id="ek-note" name="note" label="Note (optional)" placeholder="e.g. Rahul's laptop" />
        </div>
        <p className="text-[11px] text-muted">One key works on one PC.</p>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <ClayButton type="submit" loading={loading} size="sm">Create Key</ClayButton>
      </form>
    </ClayCard>
  );
}

function KeyRow({ k }: { k: EditorKey }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const live = k.pcs.filter((p) => !p.released);
  const pc = live[0];
  const run = (fn: () => Promise<{ ok: true } | { error: string }>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    start(async () => {
      const r = await fn();
      if ("error" in r) setError(r.error); else router.refresh();
    });
  };
  return (
    <ClayCard hover={false} className="!p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-base font-semibold text-heading">{k.customer}</h3>
            {k.revoked ? (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-700">Revoked</span>
            ) : pc ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">Active on 1 PC</span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">Not activated</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-cream/70 px-2 py-1 font-mono text-sm text-heading">{k.key}</code>
            <CopyButton text={k.key} />
          </div>
          <div className="text-xs text-muted space-y-1">
            {pc ? (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1"><Monitor className="w-3.5 h-3.5" /> {pc.machine_name ?? "PC"}</span>
                <span>v{pc.version ?? "?"}</span>
                <span>activated {fmt(pc.first_seen)}</span>
                <span>last check-in {fmt(pc.last_seen)}</span>
              </p>
            ) : (
              <p>No PC yet{k.pcs.length ? ` (${k.pcs.length} earlier PC${k.pcs.length > 1 ? "s" : ""} freed)` : ""}.</p>
            )}
            <p>Created {fmt(k.created_at)}{k.note ? ` · ${k.note}` : ""}</p>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {pc && !k.revoked && (
            <ClayButton size="sm" variant="ghost" disabled={pending}
              onClick={() => run(() => freeEditorKeyPc(k.key), `Free the PC "${pc.machine_name ?? "PC"}"? The key can then be activated on a new PC, and this PC stops at its next check-in.`)}>
              Free PC
            </ClayButton>
          )}
          {k.revoked ? (
            <ClayButton size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setEditorKeyRevoked(k.key, false))}>Restore</ClayButton>
          ) : (
            <ClayButton size="sm" variant="ghost" disabled={pending}
              onClick={() => run(() => setEditorKeyRevoked(k.key, true), `Revoke the key for "${k.customer}"? LFX Editor stops working on their PC at its next check-in.`)}>
              <span className="text-red-600">Revoke</span>
            </ClayButton>
          )}
        </div>
      </div>
    </ClayCard>
  );
}

export function EditorKeysManager({ keys }: { keys: EditorKey[] }) {
  return (
    <div className="space-y-4">
      <CreateKeyForm />
      {keys.length === 0 ? (
        <ClayCard hover={false} className="!p-10 text-center">
          <KeyRound className="mx-auto mb-2 h-6 w-6 text-muted" />
          <p className="text-sm text-muted">No editor keys yet.</p>
        </ClayCard>
      ) : (
        keys.map((k) => <KeyRow key={k.key} k={k} />)
      )}
    </div>
  );
}
