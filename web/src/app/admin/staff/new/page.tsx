import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Reveal } from "@/components/ui/Reveal";
import { NewStaffForm } from "./NewStaffForm";

export default async function NewStaff() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: unis } = await supabase.from("universities").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <Reveal>
        <Link href="/admin/staff" className="font-ui text-sm text-accent hover:underline">← Staff directory</Link>
        <p className="eyebrow mb-2 mt-3">New staff</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Add a BOA / staff member</h1>
      </Reveal>

      <Reveal delay={0.06} className="mt-6">
        <NewStaffForm unis={unis ?? []} />
      </Reveal>
    </div>
  );
}
