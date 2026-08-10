import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

export default async function Home() {
  const user = await requireAppUser();

  if (user.role === "admin") {
    redirect("/admin");
  }

  // BOA → send them to their (first) assigned university board.
  const supabase = await createClient();
  const { data } = await supabase
    .from("university_boas")
    .select("universities(code)")
    .limit(1);

  const code = (data?.[0]?.universities as { code?: string } | null)?.code;
  if (code) redirect(`/u/${code}`);

  // BOA with no assignment yet.
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">No university assigned yet</h1>
        <p className="mt-2 text-sm text-gray-500">
          Your account ({user.email}) isn&apos;t linked to a university. Please
          contact the Communication team to be added to the BOA list.
        </p>
      </div>
    </main>
  );
}
