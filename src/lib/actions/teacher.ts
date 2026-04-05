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
    .select("id, role, org_id, centre_id, class, board, medium")
    .eq("id", user.id)
    .single();

  if (teacherError || !teacherProfile || teacherProfile.role !== "teacher") {
    return { error: "Only teachers can manage a student list." };
  }

  const admin = createAdminClient();
  const { data: studentProfile, error: studentError } = await admin
    .from("profiles")
    .select("id, name, role, org_id, centre_id, class, board, medium, teacher_id, is_active")
    .eq("id", studentId)
    .single();

  if (studentError || !studentProfile || studentProfile.role !== "student" || !studentProfile.is_active) {
    return { error: "Student not found." };
  }

  if (studentProfile.org_id !== teacherProfile.org_id || studentProfile.centre_id !== teacherProfile.centre_id) {
    return { error: "You can only add students from your own centre." };
  }

  if (teacherProfile.class !== null && studentProfile.class !== teacherProfile.class) {
    return { error: "This student is outside your assigned class scope." };
  }

  if (teacherProfile.board && studentProfile.board !== teacherProfile.board) {
    return { error: "This student uses a different board." };
  }

  if (teacherProfile.medium && studentProfile.medium !== teacherProfile.medium) {
    return { error: "This student uses a different medium." };
  }

  if (studentProfile.teacher_id && studentProfile.teacher_id !== user.id) {
    return { error: "This student is already assigned to another teacher." };
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({ teacher_id: user.id })
    .eq("id", studentId);

  if (updateError) {
    return { error: updateError.message };
  }

  revalidatePath("/dashboard/students");
  return { success: true, message: `${studentProfile.name} added to your student list.` };
}
