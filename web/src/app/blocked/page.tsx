import Link from "next/link";
import { ALLOWED_DOMAIN } from "@/lib/constants";

export default function BlockedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-2xl">
          🔒
        </div>
        <h1 className="text-lg font-semibold text-gray-900">Access blocked</h1>
        <p className="mt-2 text-sm text-gray-500">
          This workspace is restricted to{" "}
          <span className="font-medium text-gray-700">@{ALLOWED_DOMAIN}</span>{" "}
          accounts. The account you used is not permitted.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Try a different account
        </Link>
      </div>
    </main>
  );
}
