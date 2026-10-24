import {
  CAPIBORA_NOTIFICATIONS,
  selectCapiboraNotification,
} from "../_shared/capibora.ts";
export type PushJob = {
  job_id: string;
  lease_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  vapid_key: string;
  tone: "gentle" | "dramatic";
  slot: "morning_06" | "morning_08" | "morning_10" | "reminder" | "last_call";
  day: string;
  time_zone: string;
  local_hour: number;
  local_minute: number;
  selection_key: string;
  recent_ids: string[];
  last_exaggerated_day: string | null;
  message_id: string | null;
  minimum_minutes: number;
};
export type PushConfig = { cronSecret: string; publicKey: string };
type Rpc = <T>(name: string, args: Record<string, unknown>) => Promise<T>;
type Send = (job: PushJob, payload: string) => Promise<number>;

export function allowedEndpoint(value: string): boolean {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$/.test(
        u.hostname,
      )
    );
  } catch {
    return false;
  }
}
export function selectPushCopy(job: PushJob, gentle = false) {
  return selectCapiboraNotification({
    category: "workout_reminder",
    day: job.day,
    hour: job.local_hour,
    minute: job.local_minute,
    selectionKey: job.selection_key,
    tone: gentle ? "gentle" : job.tone,
    facts: { pending: true },
    recentIds: job.recent_ids,
    lastExaggeratedDay: job.last_exaggerated_day,
    existingId: gentle ? null : job.message_id,
    minimumMinutes: job.minimum_minutes,
  });
}
export function pushMessage(job: PushJob, messageId = selectPushCopy(job)?.id) {
  const copy = CAPIBORA_NOTIFICATIONS.find(
    (p) => p.id === messageId && p.category === "workout_reminder",
  );
  if (!copy) return null;
  return {
    title: copy.title,
    body: copy.body,
    tag: `fokus-${job.day}-${job.slot}`,
  };
}
async function equalSecret(a: string, b: string) {
  const digest = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    );
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
export async function dispatch(
  request: Request,
  config: PushConfig,
  rpc: Rpc,
  send: Send,
): Promise<Response> {
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  if (
    !config.cronSecret ||
    !(await equalSecret(
      request.headers.get("x-cron-secret") ?? "",
      config.cronSecret,
    ))
  )
    return new Response("Unauthorized", { status: 401 });
  try {
    const jobs = await rpc<PushJob[]>("claim_push_jobs", { p_limit: 24 });
    let sent = 0,
      expired = 0,
      retry = 0;
    // Bounded batches keep slow providers within the Edge Function runtime limit.
    for (let offset = 0; offset < jobs.length; offset += 8)
      await Promise.all(
        jobs.slice(offset, offset + 8).map(async (job) => {
          let result = "expired";
          try {
            if (
              job.vapid_key === config.publicKey &&
              allowedEndpoint(job.endpoint)
            ) {
              const copy = selectPushCopy(job),
                fallback = selectPushCopy(job, true);
              const reserved =
                copy && fallback
                  ? await rpc<string | null>("reserve_push_message", {
                      p_id: job.job_id,
                      p_lease: job.lease_id,
                      p_message_id: copy.id,
                      p_humor: copy.intensity,
                      p_fallback_id: fallback.id,
                    })
                  : null;
              const payload = reserved ? pushMessage(job, reserved) : null;
              if (!payload) {
                await rpc("finish_push_job", {
                  p_id: job.job_id,
                  p_lease: job.lease_id,
                  p_result: "expired",
                });
                expired++;
                return;
              }
              // A confirmation/opt-out can commit while the copy is being reserved.
              // Reuse the canonical eligibility check at the dispatch boundary.
              if (!(await rpc<boolean>("push_job_allowed", {
                p_id: job.job_id, p_lease: job.lease_id,
              }))) {
                await rpc("finish_push_job", {
                  p_id: job.job_id, p_lease: job.lease_id, p_result: "expired",
                });
                expired++;
                return;
              }
              const status = await send(job, JSON.stringify(payload));
              result =
                status >= 200 && status < 300
                  ? "sent"
                  : status === 404 || status === 410
                    ? "gone"
                    : status === 429 || status >= 500
                      ? "retry"
                      : "expired";
            }
          } catch {
            result = "retry";
          }
          await rpc("finish_push_job", {
            p_id: job.job_id,
            p_lease: job.lease_id,
            p_result: result,
          });
          if (result === "sent") sent++;
          else if (result === "retry") retry++;
          else expired++;
        }),
      );
    return Response.json({ claimed: jobs.length, sent, expired, retry });
  } catch {
    return Response.json({ error: "Push dispatch failed" }, { status: 500 });
  }
}
