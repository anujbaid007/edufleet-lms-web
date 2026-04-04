"use client";

import { useState } from "react";
import { ClayCard } from "@/components/ui/clay-card";
import { addRestriction, removeRestriction } from "@/lib/actions/admin";
import { Shield, X, Loader2 } from "lucide-react";

interface Restriction {
  id: string;
  chapter_id: string;
  chapterTitle: string;
  chapterNo: number;
  subjectName: string;
  className: number;
}

interface Chapter {
  id: string;
  title: string;
  chapter_no: number;
  class: number;
  subjectName: string;
}

interface AccessManagerProps {
  orgId: string;
  orgName: string;
  restrictions: Restriction[];
  availableChapters: Chapter[];
}

export function AccessManager({ orgId, orgName, restrictions, availableChapters }: AccessManagerProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [addingChapter, setAddingChapter] = useState("");

  const restrictedIds = new Set(restrictions.map((r) => r.chapter_id));
  const unrestricted = availableChapters.filter((c) => !restrictedIds.has(c.id));

  async function handleAdd() {
    if (!addingChapter) return;
    setLoading("add");
    await addRestriction(orgId, addingChapter);
    setAddingChapter("");
    setLoading(null);
  }

  async function handleRemove(id: string) {
    setLoading(id);
    await removeRestriction(id);
    setLoading(null);
  }

  return (
    <ClayCard hover={false} className="!p-5">
      <div className="flex items-center gap-3 mb-4">
        <Shield className="w-5 h-5 text-orange-primary" />
        <h3 className="font-poppins font-bold text-heading text-sm">{orgName}</h3>
        <span className="text-xs text-muted">{restrictions.length} restricted</span>
      </div>

      {/* Add restriction */}
      <div className="flex gap-2 mb-4">
        <select
          className="clay-input flex-1 !py-2 text-sm"
          value={addingChapter}
          onChange={(e) => setAddingChapter(e.target.value)}
        >
          <option value="">Select chapter to restrict...</option>
          {unrestricted.map((ch) => (
            <option key={ch.id} value={ch.id}>
              Class {ch.class === 0 ? "KG" : ch.class} · {ch.subjectName} · Ch.{ch.chapter_no}: {ch.title}
            </option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          disabled={!addingChapter || loading === "add"}
          className="clay-btn clay-surface-orange text-white shadow-clay-orange px-4 py-2 text-sm disabled:opacity-50"
        >
          {loading === "add" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Block"}
        </button>
      </div>

      {/* Current restrictions */}
      {restrictions.length > 0 ? (
        <div className="space-y-2">
          {restrictions.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded-clay-sm bg-red-50/60 border border-red-200/40">
              <div>
                <p className="text-sm font-medium text-heading">
                  Class {r.className === 0 ? "KG" : r.className} · {r.subjectName} · Ch.{r.chapterNo}: {r.chapterTitle}
                </p>
              </div>
              <button
                onClick={() => handleRemove(r.id)}
                disabled={loading === r.id}
                className="text-red-500 hover:text-red-700 transition-colors"
              >
                {loading === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">No restrictions — all content is accessible.</p>
      )}
    </ClayCard>
  );
}
