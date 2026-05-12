"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function assignStudentToTeacher(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  const studentId = (formData.get("student_id") as string) || "";
  if (!studentId) {
    return { error: "Select a student to add." };
  }

  const { data: teacherProfile, error: teacherError } = await supabase
    .from("profiles")
    .select("id, role, org_id, centre_id, classes, board, medium")
    .eq("id", user.id)
    .single();

  if (teacherError || !teacherProfile || teacherProfile.role !== "teacher") {
    return { error: "Only teachers can manage a student list." };
  }

  const admin = createAdminClient();
  const { data: studentProfile, error: studentError } = await admin
    .from("profiles")
    .select("id, name, role, org_id, centre_id, class, board, medium, teacher_ids, is_active")
    .eq("id", studentId)
    .single();

  if (studentError || !studentProfile || studentProfile.role !== "student" || !studentProfile.is_active) {
    return { error: "Student not found." };
  }

  if (studentProfile.org_id !== teacherProfile.org_id || studentProfile.centre_id !== teacherProfile.centre_id) {
    return { error: "You can only add students from your own centre." };
  }

  // Check class scope: teacher's classes array (null/empty = all classes allowed)
  const teacherClasses = teacherProfile.classes as number[] | null;
  if (teacherClasses && teacherClasses.length > 0 && studentProfile.class !== null) {
    if (!teacherClasses.includes(studentProfile.class)) {
      return { error: "This student is outside your assigned class scope." };
    }
  }

  if (teacherProfile.board && studentProfile.board !== teacherProfile.board) {
    return { error: "This student uses a different board." };
  }

  if (teacherProfile.medium && studentProfile.medium !== teacherProfile.medium) {
    return { error: "This student uses a different medium." };
  }

  // Check if already assigned to this teacher
  const existingTeacherIds = (studentProfile.teacher_ids as string[]) ?? [];
  if (existingTeacherIds.includes(user.id)) {
    return { error: "This student is already assigned to you." };
  }

  // Add this teacher to the student's teacher_ids array
  const updatedTeacherIds = [...existingTeacherIds, user.id];

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      teacher_ids: updatedTeacherIds,
      teacher_id: updatedTeacherIds[0],
    })
    .eq("id", studentId);

  if (updateError) {
    return { error: updateError.message };
  }

  revalidatePath("/dashboard/students");
  return { success: true, message: `${studentProfile.name} added to your student list.` };
}
