import Link from "next/link";
import { requireAdmin, isFullAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Reveal } from "@/components/ui/Reveal";
import { ReadOnlyNotice } from "@/components/ReadOnlyNotice";
import { EventDetailsForm } from "@/components/events/EventForms";
import { loadEventOptions } from "@/lib/eventOptions";

export default async function NewEvent() {
  const canEdit = isFullAdmin(await requireAdmin());
  const supabase = await createClient();
  const [{ data: unis }, options] = await Promise.all([
    supabase.from("universities").select("id, name").order("name"),
    loadEventOptions(supabase),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Reveal>
        <Link href="/admin/events" className="font-ui text-sm text-accent hover:underline">← Event reports</Link>
        <p className="eyebrow mb-2 mt-3">Student Engagement</p>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">New event</h1>
        <p className="mt-2 font-ui text-sm text-muted">
          Add the event details here — no sheet needed. The university&apos;s staff then fill the report from their board.
          If the same event is later added to the sheet, it&apos;s linked to this one (not duplicated).
        </p>
      </Reveal>
      <Reveal delay={0.06} className="mt-6">
        {canEdit ? (
          <EventDetailsForm mode="create" universities={(unis ?? []).map((u) => ({ value: u.id as string, label: u.name as string }))} options={options} />
        ) : (
          <ReadOnlyNotice what="create events" />
        )}
      </Reveal>
    </div>
  );
}
