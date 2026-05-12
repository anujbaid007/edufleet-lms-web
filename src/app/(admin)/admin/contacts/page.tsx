import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";

export const metadata = { title: "Contact Messages" };

export default async function ContactMessagesPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (!profile || profile.role !== "platform_admin") redirect("/admin");

  const adminClient = createAdminClient();
  const { data: messages, count } = await adminClient
    .from("contact_messages")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  const total = count ?? 0;

  return (
    <div className="space-y-6">
      <Header
        title="Contact Messages"
        subtitle={`${total} submission${total !== 1 ? "s" : ""} from edufleet.in`}
      />

      {total === 0 ? (
        <ClayCard hover={false} className="!p-10 text-center">
          <p className="text-sm text-muted">No contact form submissions yet.</p>
        </ClayCard>
      ) : (
        <div className="space-y-4">
          {(messages ?? []).map((msg) => (
            <ClayCard key={msg.id} hover={false} className="!p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="text-base font-semibold text-heading">
                      {msg.name}
                    </h3>
                    {msg.role && (
                      <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-[11px] font-semibold text-orange-700">
                        {msg.role}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span>{msg.email}</span>
                    {msg.phone && <span>{msg.phone}</span>}
                    {msg.organization && <span>{msg.organization}</span>}
                  </div>

                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-body">
                    {msg.message}
                  </p>
                </div>

                <time
                  dateTime={msg.created_at}
                  className="shrink-0 text-xs text-muted"
                >
                  {new Date(msg.created_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
            </ClayCard>
          ))}
        </div>
      )}
    </div>
  );
}
