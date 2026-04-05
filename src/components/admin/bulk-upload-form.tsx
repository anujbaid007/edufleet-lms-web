"use client";

import { useState, useRef } from "react";
import { ClayButton } from "@/components/ui/clay-button";
import { ClayCard } from "@/components/ui/clay-card";
import { bulkCreateUsers } from "@/lib/actions/admin";
import { Upload, CheckCircle2, XCircle, FileText } from "lucide-react";

interface BulkUploadFormProps {
  defaultOrgId: string | null;
  defaultCentreId: string | null;
}

type UserRole = "platform_admin" | "org_admin" | "centre_admin" | "teacher" | "student";

interface ParsedUser {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  class: number | null;
  board: string | null;
  medium: string | null;
  teacher_id: string | null;
}

interface UploadResult {
  email: string;
  success: boolean;
  error?: string;
}

export function BulkUploadForm({ defaultOrgId, defaultCentreId }: BulkUploadFormProps) {
  const [parsed, setParsed] = useState<ParsedUser[]>([]);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setResults([]);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.trim().split("\n");
      if (lines.length < 2) {
        setError("CSV must have a header row and at least one data row");
        return;
      }

      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const nameIdx = headers.indexOf("name");
      const emailIdx = headers.indexOf("email");
      const passwordIdx = headers.indexOf("password");
      const roleIdx = headers.indexOf("role");
      const classIdx = headers.indexOf("class");
      const boardIdx = headers.indexOf("board");
      const mediumIdx = headers.indexOf("medium");
      const teacherIdx = headers.indexOf("teacher_id");

      if (nameIdx === -1 || emailIdx === -1 || passwordIdx === -1) {
        setError("CSV must have: name, email, password columns (role optional, defaults to student)");
        return;
      }

      const users: ParsedUser[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim());
        if (!cols[emailIdx]) continue;

        users.push({
          name: cols[nameIdx] || "",
          email: cols[emailIdx] || "",
          password: cols[passwordIdx] || "",
          role: (roleIdx !== -1 ? (cols[roleIdx] || "student") : "student") as UserRole,
          class:
            ["student", "teacher"].includes(roleIdx !== -1 ? (cols[roleIdx] || "student") : "student") && classIdx !== -1 && cols[classIdx]
              ? Number(cols[classIdx])
              : null,
          board: boardIdx !== -1 ? (cols[boardIdx] || null) : null,
          medium: mediumIdx !== -1 ? (cols[mediumIdx] || null) : null,
          teacher_id:
            (roleIdx !== -1 ? (cols[roleIdx] || "student") : "student") === "student" && teacherIdx !== -1
              ? (cols[teacherIdx] || null)
              : null,
        });
      }

      setParsed(users);
    };
    reader.readAsText(file);
  }

  async function handleUpload() {
    setLoading(true);
    setError(null);

    const usersWithOrg = parsed.map((u) => ({
      ...u,
      org_id: defaultOrgId,
      centre_id: defaultCentreId,
    }));

    const result = await bulkCreateUsers(usersWithOrg);
    setResults(result.results);
    setLoading(false);
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <ClayCard hover={false} className="!p-6">
        <div className="text-center">
          <Upload className="w-10 h-10 text-orange-primary mx-auto mb-3" />
          <h3 className="font-poppins font-bold text-heading mb-1">Upload CSV File</h3>
          <p className="text-xs text-muted mb-4">
            Required columns: <strong>name, email, password</strong>. Optional: role, class, board, medium, teacher_id
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <ClayButton variant="secondary" onClick={() => fileRef.current?.click()} size="sm">
            <FileText className="w-4 h-4" /> Select CSV File
          </ClayButton>
        </div>
      </ClayCard>

      {error && (
        <div className="px-4 py-3 rounded-clay-sm bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
      )}

      {/* Preview */}
      {parsed.length > 0 && results.length === 0 && (
        <ClayCard hover={false} className="!p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-poppins font-bold text-heading text-sm">{parsed.length} users to create</h3>
            <ClayButton onClick={handleUpload} loading={loading} size="sm">
              Create All Users
            </ClayButton>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {parsed.map((u, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-clay-sm bg-cream/40 text-sm">
                <span className="font-medium text-heading w-40 truncate">{u.name}</span>
                <span className="text-muted flex-1 truncate">{u.email}</span>
                <span className="text-xs text-muted">{u.role}</span>
                {(u.role === "student" || u.role === "teacher") && u.class !== null && <span className="text-xs text-muted">Class {u.class}</span>}
              </div>
            ))}
          </div>
        </ClayCard>
      )}

      {/* Results */}
      {results.length > 0 && (
        <ClayCard hover={false} className="!p-5">
          <h3 className="font-poppins font-bold text-heading text-sm mb-2">
            Results: {successCount} created, {failCount} failed
          </h3>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-clay-sm text-sm">
                {r.success ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                )}
                <span className="text-body">{r.email}</span>
                {r.error && <span className="text-xs text-red-500">{r.error}</span>}
              </div>
            ))}
          </div>
        </ClayCard>
      )}
    </div>
  );
}
