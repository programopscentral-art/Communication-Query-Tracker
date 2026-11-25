import "server-only";
import { classifyHttp, describeHttp, type PostResult } from "@/lib/teamsCard";

// Posts one card to a Teams Workflows webhook. The URL is a secret: it is never
// logged, thrown, or put into the returned message (network errors are reduced
// to "timed out" / "couldn't connect" so nothing from the request can leak).

export const TEAMS_TIMEOUT_MS = 10_000;

export async function postToTeams(url: string, payload: unknown, timeoutMs = TEAMS_TIMEOUT_MS): Promise<PostResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    const timedOut = name === "TimeoutError" || name === "AbortError";
    return {
      ok: false,
      kind: "retry",
      status: null,
      message: timedOut ? `Teams didn't answer within ${Math.round(timeoutMs / 1000)} s` : "Couldn't connect to Teams (network error)",
    };
  }
  const kind = classifyHttp(res.status);
  if (kind === "ok") return { ok: true, kind, status: res.status, message: "Accepted by Teams" };
  const body = await res.text().catch(() => "");
  return { ok: false, kind, status: res.status, message: describeHttp(res.status, body) };
}
