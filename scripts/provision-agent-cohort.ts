import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type UserRole = "platform_admin" | "org_admin" | "centre_admin" | "teacher" | "student";
type OrgType = "ngo" | "csr";

type Database = {
  public: {
    Tables: {
      organizations: {
        Row: { id: string; name: string; type: OrgType; is_active: boolean };
        Insert: { name: string; type: OrgType };
      };
      centres: {
        Row: { id: string; org_id: string; name: string; location: string | null; is_active: boolean };
        Insert: { org_id: string; name: string; location: string | null };
      };
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          org_id: string | null;
          centre_id: string | null;
          teacher_id: string | null;
          name: string;
          class: number | null;
          board: string | null;
          medium: string | null;
          is_active: boolean;
          phone: string | null;
        };
        Update: {
          role?: UserRole;
          org_id?: string | null;
          centre_id?: string | null;
          teacher_id?: string | null;
          name?: string;
          class?: number | null;
          board?: string | null;
          medium?: string | null;
          is_active?: boolean;
          phone?: string | null;
        };
      };
      chapters: {
        Row: {
          id: string;
          class: number;
          board: string;
          medium: string;
          title: string;
          subject_id: string;
        };
      };
      subjects: {
        Row: {
          id: string;
          name: string;
        };
      };
      content_restrictions: {
        Row: { org_id: string; chapter_id: string };
        Insert: { org_id: string; chapter_id: string };
      };
    };
  };
};

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RUN_ID = "apr05";
const PLATFORM_ADMIN_EMAIL = "admin@edufleet.in";
const PLATFORM_ADMIN_PASSWORD = "EduFleetAdmin!2026";
const AGENT_PASSWORD = "EduFleetAgents!2026";

const orgBlueprints = [
  {
    name: `AI Swarm North NGO ${RUN_ID.toUpperCase()}`,
    type: "ngo" as const,
    centres: [
      { name: "Gurugram Learning Hub", location: "Gurugram" },
      { name: "Noida Community Lab", location: "Noida" },
    ],
  },
  {
    name: `AI Swarm West CSR ${RUN_ID.toUpperCase()}`,
    type: "csr" as const,
    centres: [
      { name: "Mumbai Coastal Centre", location: "Mumbai" },
      { name: "Pune Growth Centre", location: "Pune" },
    ],
  },
  {
    name: `AI Swarm South NGO ${RUN_ID.toUpperCase()}`,
    type: "ngo" as const,
    centres: [
      { name: "Bengaluru Bridge Centre", location: "Bengaluru" },
      { name: "Chennai Rising Centre", location: "Chennai" },
    ],
  },
];

type ProvisionedUser = {
  role: UserRole;
  email: string;
  password: string;
  name: string;
  organization: string | null;
  centre: string | null;
  class: number | null;
  board: string | null;
  medium: string | null;
};

async function listAuthUsersByEmail(client: SupabaseClient<Database>) {
  const allUsers = new Map<string, string>();
  let page = 1;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data.users ?? [];
    for (const user of users) {
      if (user.email) {
        allUsers.set(user.email.toLowerCase(), user.id);
      }
    }
    if (users.length < 200) break;
    page += 1;
  }

  return allUsers;
}

async function ensureOrganization(name: string, type: OrgType) {
  const { data: existing, error: lookupError } = await supabase
    .from("organizations")
    .select("id, name, type, is_active")
    .eq("name", name)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing) {
    const { error: updateError } = await supabase
      .from("organizations")
      .update({ type, is_active: true })
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return existing.id;
  }

  const { data, error } = await supabase
    .from("organizations")
    .insert({ name, type })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function ensureCentre(orgId: string, name: string, location: string | null) {
  const { data: existing, error: lookupError } = await supabase
    .from("centres")
    .select("id, name, location, org_id")
    .eq("org_id", orgId)
    .eq("name", name)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing) {
    const { error: updateError } = await supabase
      .from("centres")
      .update({ location, is_active: true })
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return existing.id;
  }

  const { data, error } = await supabase
    .from("centres")
    .insert({ org_id: orgId, name, location })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function ensureUser(
  authUsersByEmail: Map<string, string>,
  input: {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    orgId: string | null;
    centreId: string | null;
    teacherId: string | null;
    classNum: number | null;
    board: string | null;
    medium: string | null;
    phone?: string | null;
  }
) {
  const emailKey = input.email.toLowerCase();
  let userId = authUsersByEmail.get(emailKey);

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        name: input.name,
        role: input.role,
      },
    });
    if (error) throw error;
    if (!data.user) throw new Error(`Failed to create auth user for ${input.email}`);
    userId = data.user.id;
    authUsersByEmail.set(emailKey, userId);
  } else {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        name: input.name,
        role: input.role,
      },
    });
    if (error) throw error;
  }

  const profileUpdate: Database["public"]["Tables"]["profiles"]["Update"] = {
    name: input.name,
    role: input.role,
    org_id: input.orgId,
    centre_id: input.centreId,
    teacher_id: input.teacherId,
    class: input.classNum,
    board: input.board,
    medium: input.medium,
    is_active: true,
    phone: input.phone ?? null,
  };

  const { error: profileError } = await supabase
    .from("profiles")
    .update(profileUpdate)
    .eq("id", userId);
  if (profileError) throw profileError;

  return userId;
}

async function applyOrgRestrictions(orgId: string) {
  const { data: subjects, error: subjectError } = await supabase
    .from("subjects")
    .select("id, name");
  if (subjectError) throw subjectError;

  const allowedNames = new Set(["English", "EVS"]);
  const blockedSubjectIds = new Set(
    (subjects ?? [])
      .filter((subject) => !allowedNames.has(subject.name))
      .map((subject) => subject.id)
  );

  const { data: blockedChapters, error: chapterError } = await supabase
    .from("chapters")
    .select("id, subject_id, class, board, medium")
    .eq("class", 1)
    .eq("board", "CBSE")
    .eq("medium", "English");
  if (chapterError) throw chapterError;

  const chapterIdsToBlock = (blockedChapters ?? [])
    .filter((chapter) => blockedSubjectIds.has(chapter.subject_id))
    .map((chapter) => chapter.id);

  const { data: existingRestrictions, error: restrictionLookupError } = await supabase
    .from("content_restrictions")
    .select("chapter_id")
    .eq("org_id", orgId);
  if (restrictionLookupError) throw restrictionLookupError;

  const existing = new Set(existingRestrictions?.map((row) => row.chapter_id) ?? []);
  const inserts = chapterIdsToBlock
    .filter((chapterId) => !existing.has(chapterId))
    .map((chapter_id) => ({ org_id: orgId, chapter_id }));

  if (inserts.length > 0) {
    const { error: insertError } = await supabase
      .from("content_restrictions")
      .insert(inserts);
    if (insertError) throw insertError;
  }
}

async function main() {
  const provisionedUsers: ProvisionedUser[] = [];
  const authUsersByEmail = await listAuthUsersByEmail(supabase);

  await ensureUser(authUsersByEmail, {
    email: PLATFORM_ADMIN_EMAIL,
    password: PLATFORM_ADMIN_PASSWORD,
    name: "EduFleet Admin",
    role: "platform_admin",
    orgId: null,
    centreId: null,
    teacherId: null,
    classNum: null,
    board: null,
    medium: null,
  });

  provisionedUsers.push({
    role: "platform_admin",
    email: PLATFORM_ADMIN_EMAIL,
    password: PLATFORM_ADMIN_PASSWORD,
    name: "EduFleet Admin",
    organization: null,
    centre: null,
    class: null,
    board: null,
    medium: null,
  });

  for (let orgIndex = 0; orgIndex < orgBlueprints.length; orgIndex += 1) {
    const orgBlueprint = orgBlueprints[orgIndex];
    const orgId = await ensureOrganization(orgBlueprint.name, orgBlueprint.type);
    await applyOrgRestrictions(orgId);

    const orgAdminName = `Org Admin ${orgIndex + 1}`;
    const orgAdminEmail = `org${orgIndex + 1}.admin.${RUN_ID}@test.edufleet.in`;

    await ensureUser(authUsersByEmail, {
      email: orgAdminEmail,
      password: AGENT_PASSWORD,
      name: orgAdminName,
      role: "org_admin",
      orgId,
      centreId: null,
      teacherId: null,
      classNum: null,
      board: null,
      medium: null,
    });

    provisionedUsers.push({
      role: "org_admin",
      email: orgAdminEmail,
      password: AGENT_PASSWORD,
      name: orgAdminName,
      organization: orgBlueprint.name,
      centre: null,
      class: null,
      board: null,
      medium: null,
    });

    for (let centreIndex = 0; centreIndex < orgBlueprint.centres.length; centreIndex += 1) {
      const centreBlueprint = orgBlueprint.centres[centreIndex];
      const centreId = await ensureCentre(orgId, centreBlueprint.name, centreBlueprint.location);

      const centreAdminName = `Centre Head ${orgIndex + 1}.${centreIndex + 1}`;
      const centreAdminEmail = `org${orgIndex + 1}.centre${centreIndex + 1}.head.${RUN_ID}@test.edufleet.in`;
      await ensureUser(authUsersByEmail, {
        email: centreAdminEmail,
        password: AGENT_PASSWORD,
        name: centreAdminName,
        role: "centre_admin",
        orgId,
        centreId,
        teacherId: null,
        classNum: null,
        board: null,
        medium: null,
      });

      provisionedUsers.push({
        role: "centre_admin",
        email: centreAdminEmail,
        password: AGENT_PASSWORD,
        name: centreAdminName,
        organization: orgBlueprint.name,
        centre: centreBlueprint.name,
        class: null,
        board: null,
        medium: null,
      });

      const teacherName = `Teacher ${orgIndex + 1}.${centreIndex + 1}`;
      const teacherEmail = `org${orgIndex + 1}.centre${centreIndex + 1}.teacher.${RUN_ID}@test.edufleet.in`;
      const teacherId = await ensureUser(authUsersByEmail, {
        email: teacherEmail,
        password: AGENT_PASSWORD,
        name: teacherName,
        role: "teacher",
        orgId,
        centreId,
        teacherId: null,
        classNum: 1,
        board: "CBSE",
        medium: "English",
      });

      provisionedUsers.push({
        role: "teacher",
        email: teacherEmail,
        password: AGENT_PASSWORD,
        name: teacherName,
        organization: orgBlueprint.name,
        centre: centreBlueprint.name,
        class: 1,
        board: "CBSE",
        medium: "English",
      });

      for (let studentIndex = 0; studentIndex < 2; studentIndex += 1) {
        const studentName = `Student ${orgIndex + 1}.${centreIndex + 1}.${studentIndex + 1}`;
        const studentEmail = `org${orgIndex + 1}.centre${centreIndex + 1}.student${studentIndex + 1}.${RUN_ID}@test.edufleet.in`;
        await ensureUser(authUsersByEmail, {
          email: studentEmail,
          password: AGENT_PASSWORD,
          name: studentName,
          role: "student",
          orgId,
          centreId,
          teacherId,
          classNum: 1,
          board: "CBSE",
          medium: "English",
        });

        provisionedUsers.push({
          role: "student",
          email: studentEmail,
          password: AGENT_PASSWORD,
          name: studentName,
          organization: orgBlueprint.name,
          centre: centreBlueprint.name,
          class: 1,
          board: "CBSE",
          medium: "English",
        });
      }
    }
  }

  const outputDir = join(process.cwd(), "output");
  mkdirSync(outputDir, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    appUrl: "http://localhost:3002",
    runId: RUN_ID,
    passwords: {
      platformAdmin: PLATFORM_ADMIN_PASSWORD,
      cohortUsers: AGENT_PASSWORD,
    },
    users: provisionedUsers,
  };

  const outputPath = join(outputDir, `agent-cohort-${RUN_ID}.json`);
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`Provisioned ${provisionedUsers.length} users.`);
  console.log(`Manifest: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
