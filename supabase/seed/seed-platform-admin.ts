import { createClient } from "@supabase/supabase-js";

// Usage: npx tsx supabase/seed/seed-platform-admin.ts
// Creates the platform admin user (EduFleet developer)

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const email = "admin@edufleet.in";
  const password = "CHANGE_ME_ON_FIRST_LOGIN"; // Change this!

  // Create auth user with admin metadata
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: "EduFleet Admin",
      role: "platform_admin",
    },
  });

  if (authError) {
    console.error("Failed to create auth user:", authError.message);
    process.exit(1);
  }

  console.log(`Auth user created: ${authData.user.id}`);

  // Update profile with platform_admin role (trigger creates it, but we need to set role)
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      role: "platform_admin",
      name: "EduFleet Admin",
    })
    .eq("id", authData.user.id);

  if (profileError) {
    console.error("Failed to update profile:", profileError.message);
    process.exit(1);
  }

  console.log(`Platform admin created!`);
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
  console.log(`\n⚠️  Change the password after first login!`);
}

main().catch(console.error);
