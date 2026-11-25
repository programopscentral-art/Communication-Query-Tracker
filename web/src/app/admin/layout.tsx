import { requireAdmin, isFullAdmin } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const full = isFullAdmin(user);
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav
        home="/admin"
        email={user.email}
        roleLabel={full ? "Admin" : "Admin · Read-only"}
        items={[
          { href: "/admin", label: "Overview" },
          ...(full ? [{ href: "/admin/compose", label: "＋ New" }] : []),
          { href: "/admin/schedule", label: "Schedule" },
          { href: "/admin/tasks", label: "Tasks" },
          { href: "/admin/events", label: "Events" },
          { href: "/admin/data-source", label: "Source" },
          { href: "/admin/staff", label: "Staff" },
          { href: "/admin/tickets", label: "Tickets" },
          { href: "/admin/reminders", label: "Reminders" },
          { href: "/admin/history", label: "History" },
          { href: "/admin/comms", label: "Comms" },
        ]}
      />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
