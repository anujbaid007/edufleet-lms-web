"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { ClayButton } from "@/components/ui/clay-button";
import { ClayCard } from "@/components/ui/clay-card";
import { assignStudentToTeacher } from "@/lib/actions/teacher";

type AssignableStudent = {
  id: string;
  name: string;
  class: number | null;
  board: string | null;
  medium: string | null;
};

export function AssignStudentForm({ students }: { students: AssignableStudent[] }) {
  const router = useRouter();
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    setSuccess(null);

    const result = await assignStudentToTeacher(formData);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setSuccess(result.message ?? "Student added.");
    setLoading(false);
    router.refresh();
  }

  if (students.length === 0) {
    return (
      <ClayCard hover={false} className="!p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-primary">
            <UserPlus className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-heading">Add Existing Students</p>
            <p className="mt-1 text-sm text-muted">
              No unassigned students currently match your centre and learning scope.
            </p>
          </div>
        </div>
      </ClayCard>
    );
  }

  return (
    <ClayCard hover={false} className="!p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold text-heading">Add Existing Students</p>
          <p className="mt-1 text-sm text-muted">
            Attach an existing unassigned student from your centre to your teaching roster.
          </p>
        </div>

        <form action={handleSubmit} className="flex w-full flex-col gap-3 lg:max-w-2xl lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-2 block text-sm font-semibold text-heading font-poppins">Student</label>
            <select
              name="student_id"
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
              className="clay-input w-full"
              required
            >
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                  {" - "}
                  {student.class === 0 ? "KG" : student.class === 99 ? "General" : `Class ${student.class}`}
                  {" - "}
                  {[student.board, student.medium].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </div>

          <ClayButton type="submit" size="sm" loading={loading}>
            <UserPlus className="h-4 w-4" />
            Add To My List
          </ClayButton>
        </form>
      </div>

      {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-600">{success}</p> : null}
    </ClayCard>
  );
}
