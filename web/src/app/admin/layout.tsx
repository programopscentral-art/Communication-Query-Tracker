import { requireAdmin } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <div className="min-h-screen">
      <TopNav
        home="/admin"
        email={user.email}
        roleLabel="Admin"
        items={[
          { href: "/admin", label: "Overview" },
          { href: "/admin/compose", label: "＋ New" },
          { href: "/admin/schedule", label: "Schedule" },
          { href: "/admin/tasks", label: "Tasks" },
          { href: "/admin/data-source", label: "Source" },
          { href: "/admin/staff", label: "Staff" },
          { href: "/admin/tickets", label: "Tickets" },
          { href: "/admin/reminders", label: "Reminders" },
          { href: "/admin/history", label: "History" },
          { href: "/admin/comms", label: "Comms" },
        ]}
      />
      {children}
    </div>
  );
}
