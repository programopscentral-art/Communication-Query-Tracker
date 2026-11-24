import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUniversityAccess, isFullAdmin } from "@/lib/auth";
import { ReadOnlyNotice } from "@/components/ReadOnlyNotice";
import { createClient } from "@/lib/supabase/server";
import { fmtIST } from "@/lib/format";
import { StatusBadge, PriorityBadge } from "@/components/Badges";
import { updateTask } from "@/app/actions";
import { Reveal } from "@/components/ui/Reveal";
import { SendNowButton } from "@/components/SendNowButton";
import { ViewInSheet } from "@/components/ViewInSheet";
import { DeleteTaskButton } from "@/components/DeleteTaskButton";

const STATUS_OPTIONS = ["pending", "in_progress", "published", "blocked", "restricted"];
/** University staff pick one final status; once it's no longer pending it's locked (DB-enforced, migration 0034). */
const BOA_STATUS_OPTIONS = ["published", "blocked", "restricted"];

export default async function TaskDetail({ params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  const access = await requireUniversityAccess(code);
  const canAdminEdit = isFullAdmin(access); // content Edit / Delete
  const canRespond = access.canEdit; // status update + send-now (admin or this uni's staff)
  const supabase = await createClient();

  const { data: task } = await supabase
    .from("tasks")
    .select("*, universities(name, code)")
    .eq("id", id)
    .single();
  if (!task) notFound();

  const uni = task.universities as { name: string; code: string } | null;
  // The task must be viewed under its own university (edit rights are per-university).
  if (uni && uni.code !== code) redirect(`/u/${uni.code}/task/${id}`);

  // Full admins may set any status at any time. University staff choose Published / Blocked /
  // Restricted once; after the status leaves "pending" it's locked for them.
  const isStaff = canRespond && !canAdminEdit;
  const locked = isStaff && task.execution_status !== "pending";
  const statusOptions = !isStaff ? STATUS_OPTIONS : locked ? [task.execution_status as string] : BOA_STATUS_OPTIONS;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Reveal>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/u/${code}`} className="font-ui text-sm text-accent hover:underline">
            ← {uni?.name ?? "Board"}
          </Link>
          {canAdminEdit && (
            <div className="flex items-center gap-2">
              <Link
                href={`/u/${code}/task/${id}/edit`}
                className="rounded-full border border-line px-4 py-2 font-ui text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
              >
                Edit
              </Link>
              <DeleteTaskButton taskId={task.id} code={code} />
            </div>
          )}
        </div>

        <div className="mt-4 card p-6 sm:p-8">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.execution_status} />
            <span className="ml-auto">
              <ViewInSheet gid={task.source_gid} row={task.source_row} />
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-y-4 sm:grid-cols-3">
            <Field label="Target Uni" value={uni?.name} />
            <Field label="Team" value={task.team} />
            <Field label="Update Type" value={task.update_type} />
            <Field label="Category" value={task.category} />
            <Field label="Channel" value={task.channel} />
            <Field label="Content Type" value={task.content_type} />
            <Field label="Target Audience" value={task.target_audience} />
            <Field label="Publish At (IST)" value={fmtIST(task.publish_at)} />
            <Field label="Actual Publish" value={fmtIST(task.actual_publish_date)} />
          </dl>

          <div className="mt-6">
            <p className="eyebrow mb-2">Message / Content</p>
            <pre className="whitespace-pre-wrap rounded-xl border border-line bg-canvas p-4 font-display text-sm leading-relaxed text-ink">
              {task.message_content || "—"}
            </pre>
          </div>

          {task.special_instructions && (
            <div className="mt-5">
              <p className="eyebrow mb-2">Special Instructions</p>
              <p className="whitespace-pre-wrap text-sm text-ink">{task.special_instructions}</p>
            </div>
          )}

          {task.poster_drive_link && task.poster_drive_link !== "NA" && (
            <a
              href={task.poster_drive_link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1 font-ui text-sm font-semibold text-accent hover:underline"
            >
              View poster ↗
            </a>
          )}
        </div>
      </Reveal>

      {!canRespond ? (
        <ReadOnlyNotice what="update this task or send reminders" className="mt-6" />
      ) : (
      <>
      <Reveal delay={0.08}>
        <form action={updateTask} className="mt-6 card p-6 sm:p-8">
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="code" value={code} />
          <h2 className="font-ui text-sm font-semibold text-ink">Update status</h2>

          <fieldset disabled={locked} className="disabled:opacity-60">
            <label className="mt-4 block font-ui text-[10px] uppercase tracking-wider text-muted">
              Execution status
            </label>
            <select
              name="execution_status"
              defaultValue={isStaff && !locked ? "" : task.execution_status}
              required
              className="filter-input mt-1 w-full"
            >
              {isStaff && !locked && <option value="" disabled>Choose a status…</option>}
              {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {isStaff && !locked && (
              <p className="mt-1 font-ui text-xs text-warn">Once saved, the status can only be changed by an admin.</p>
            )}

            <label className="mt-4 block font-ui text-[10px] uppercase tracking-wider text-muted">
              Issue / Blocker (optional)
            </label>
            <textarea name="issue_blocker" rows={2} defaultValue={task.issue_blocker ?? ""} className="filter-input mt-1 w-full" />

            <button className="mt-5 rounded-full bg-accent px-5 py-2.5 font-ui text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-all enabled:hover:-translate-y-0.5">
              Save update
            </button>
          </fieldset>
          {locked ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 font-ui text-sm text-amber-900">
              Status is locked. Contact an admin to change it.
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted">
              Marking <b className="text-ink">published</b> stamps the actual publish time automatically.
            </p>
          )}
        </form>
      </Reveal>

      <Reveal delay={0.12}>
        <div className="mt-6 card p-6 sm:p-8">
          <p className="eyebrow mb-1">Manual reminder</p>
          <p className="mb-4 font-ui text-sm text-muted">
            Push a WhatsApp reminder to this university&apos;s BOAs right now — regardless of the
            automatic schedule.
          </p>
          <SendNowButton taskId={task.id} code={code} />
        </div>
      </Reveal>
      </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="font-ui text-[10px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value || "—"}</dd>
    </div>
  );
}
