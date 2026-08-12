import { notFound } from "next/navigation";
import { requireUniversityAccess, hasAdminAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/TopNav";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { Footer } from "@/components/Footer";

export default async function UniversityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  // STRICT: a BOA can only enter their own university's pages.
  const user = await requireUniversityAccess(code);
  const supabase = await createClient();
  const { data: uni } = await supabase
    .from("universities")
    .select("id, name, code")
    .eq("code", code)
    .single();
  if (!uni) notFound();

  const [{ data: stats }, { data: anns }] = await Promise.all([
    supabase.rpc("university_quick_stats", { p_university_id: uni.id }).maybeSingle(),
    supabase
      .from("announcements")
      .select("id, message, kind")
      .or(`university_id.eq.${uni.id},university_id.is.null`)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav
        home={`/u/${code}`}
        email={user.email}
        roleLabel={uni.name}
        backTo={hasAdminAccess(user) ? { href: "/admin", label: "Admin" } : undefined}
        items={[
          { href: `/u/${code}`, label: "Board" },
          { href: `/u/${code}/team`, label: "Team" },
          { href: `/u/${code}/reminders`, label: "My Reminders" },
          { href: `/u/${code}/tickets`, label: "Tickets" },
        ]}
      />
      <AnnouncementBar
        stats={
          (stats as { today: number; pending: number; overdue: number; next_publish: string | null } | null) ?? {
            today: 0,
            pending: 0,
            overdue: 0,
            next_publish: null,
          }
        }
        announcements={anns ?? []}
      />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
