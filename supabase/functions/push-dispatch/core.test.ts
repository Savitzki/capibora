import { strict as assert } from "node:assert";
import { createECDH, randomBytes } from "node:crypto";
// @deno-types="npm:@types/web-push@3.6.4"
import webpush from "npm:web-push@3.6.7";
import ece from "npm:http_ece@1.2.1";
import {
  allowedEndpoint,
  dispatch,
  pushMessage,
  selectPushCopy,
  type PushJob,
} from "./core.ts";

const job: PushJob = {
  job_id: "job",
  lease_id: "lease",
  endpoint: "https://fcm.googleapis.com/test",
  p256dh: "test",
  auth: "test",
  vapid_key: "public",
  tone: "dramatic",
  slot: "last_call",
  day: "2026-10-16",
  time_zone: "UTC",
  local_hour: 21,
  local_minute: 0,
  selection_key: "account",
  recent_ids: [],
  last_exaggerated_day: null,
  message_id: null,
  minimum_minutes: 35,
};
const request = (secret = "cron") =>
  new Request("https://example.com/push", {
    method: "POST",
    headers: { "x-cron-secret": secret },
  });

Deno.test(
  "rejects unauthenticated cron without accessing the database",
  async () => {
    const response = await dispatch(
      request("wrong"),
      { cronSecret: "cron", publicKey: "public" },
      () => {
        throw new Error("Database accessed");
      },
      () => {
        throw new Error("Push sent");
      },
    );
    assert.equal(response.status, 401);
  },
);
Deno.test(
  "restricts push destinations, including redirects/credentials/ports",
  () => {
    assert(allowedEndpoint("https://web.push.apple.com/valid"));
    for (const endpoint of [
      "https://127.0.0.1/a",
      "http://fcm.googleapis.com/a",
      "https://fcm.googleapis.com.evil.test/a",
      "https://user:pass@fcm.googleapis.com/a",
      "https://fcm.googleapis.com:8080/a",
    ])
      assert(!allowedEndpoint(endpoint));
  },
);
Deno.test("separates optional drama from the gentle tone", () => {
  assert.equal(selectPushCopy({ ...job, tone: "gentle" })?.intensity, "light");
  assert.equal(selectPushCopy(job)?.period, "evening");
  assert.equal(pushMessage(job)?.tag, "fokus-2026-10-16-last_call");
  assert.equal(pushMessage({ ...job, local_hour: 23 }), null);
});
for (const [status, result] of [
  [201, "sent"],
  [410, "gone"],
  [404, "gone"],
  [429, "retry"],
  [503, "retry"],
  [400, "expired"],
] as const) {
  Deno.test(`provider ${status} produces ${result}`, async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const rpc = async <T>(
      name: string,
      args: Record<string, unknown>,
    ): Promise<T> => {
      calls.push({ name, args });
      return (
        name === "claim_push_jobs"
          ? [job]
          : name === "reserve_push_message"
            ? args.p_message_id
            : name === "push_job_allowed" ? true : null
      ) as T;
    };
    const response = await dispatch(
      request(),
      { cronSecret: "cron", publicKey: "public" },
      rpc,
      async () => status,
    );
    assert.equal(response.status, 200);
    assert.equal(calls.at(-1)?.args.p_result, result);
    assert.equal(calls.at(-1)?.args.p_lease, "lease");
  });
}
Deno.test(
  "rechecks workouts and never sends stale or rotated subscriptions",
  async () => {
    let sent = 0;
    const rpc = async <T>(name: string): Promise<T> =>
      (name === "claim_push_jobs"
        ? [
            job,
            { ...job, vapid_key: "old" },
            { ...job, endpoint: "https://internal.invalid/x" },
          ]
        : null) as T;
    await dispatch(
      request(),
      { cronSecret: "cron", publicKey: "public" },
      rpc,
      async () => {
        sent++;
        return 201;
      },
    );
    assert.equal(sent, 0);
  },
);
Deno.test(
  "web-push generates encrypted aes128gcm payload that the device can decrypt",
  () => {
    const receiver = createECDH("prime256v1");
    receiver.generateKeys();
    const secret = randomBytes(16);
    const vapid = webpush.generateVAPIDKeys();
    const payload = JSON.stringify(pushMessage(job));
    const details = webpush.generateRequestDetails(
      {
        endpoint: job.endpoint,
        keys: {
          p256dh: receiver.getPublicKey().toString("base64url"),
          auth: secret.toString("base64url"),
        },
      },
      payload,
      {
        TTL: 60,
        vapidDetails: { subject: "mailto:test@example.com", ...vapid },
        contentEncoding: "aes128gcm",
      },
    );
    assert.equal(details.headers["Content-Encoding"], "aes128gcm");
    assert(String(details.headers.Authorization).startsWith("vapid "));
    const decrypted = ece.decrypt(details.body, {
      version: "aes128gcm",
      privateKey: receiver,
      authSecret: secret,
    });
    assert.equal(decrypted.toString(), payload);
  },
);
Deno.test(
  "reservation rechecks eligibility and preserves persisted copy after a timeout",
  async () => {
    let sends = 0;
    const saved = "evening-wait";
    const rpc = async <T>(
      name: string,
      args: Record<string, unknown>,
    ): Promise<T> => {
      if (name === "claim_push_jobs")
        return [{ ...job, message_id: saved }] as T;
      if (name === "push_job_allowed") return true as T;
      if (name === "reserve_push_message") {
        assert.equal(args.p_message_id, saved);
        return saved as T;
      }
      return null as T;
    };
    await dispatch(
      request(),
      { cronSecret: "cron", publicKey: "public" },
      rpc,
      async (_job, payload) => {
        sends++;
        assert.equal(JSON.parse(payload).title, "TIC TAC TIC TAC");
        assert.equal(JSON.parse(payload).body, "O dia tá acabando, hein");
        return 201;
      },
    );
    assert.equal(sends, 1);
  },
);
Deno.test(
  "stale reservations never produce a notification or bypass the server",
  async () => {
    let sends = 0;
    const rpc = async <T>(name: string): Promise<T> =>
      (name === "claim_push_jobs" ? [job] : null) as T;
    const response = await dispatch(
      request(),
      { cronSecret: "cron", publicKey: "public" },
      rpc,
      async () => {
        sends++;
        return 201;
      },
    );
    assert.equal(sends, 0);
    assert.equal((await response.json()).expired, 1);
  },
);

Deno.test("morning cadence delivers distinct slots with morning copy", async () => {
  const jobs: PushJob[] = [6, 8, 10].map((hour) => ({
    ...job, job_id: `morning-${hour}`, local_hour: hour,
    slot: `morning_${String(hour).padStart(2, "0")}` as PushJob["slot"],
  }));
  const tags: string[] = [];
  const response = await dispatch(request(), { cronSecret: "cron", publicKey: "public" },
    async <T>(name: string, args: Record<string, unknown>): Promise<T> =>
      (name === "claim_push_jobs" ? jobs : name === "reserve_push_message" ? args.p_message_id : name === "push_job_allowed" ? true : null) as T,
    async (current, payload) => {
      assert.equal(selectPushCopy(current)?.period, "morning");
      tags.push(JSON.parse(payload).tag);
      return 201;
    });
  assert.equal((await response.json()).sent, 3);
  assert.equal(new Set(tags).size, 3);
});

Deno.test("a confirmation arriving after reservation suppresses dispatch", async () => {
  let sends = 0;
  const calls: string[] = [];
  const response = await dispatch(request(), { cronSecret: "cron", publicKey: "public" },
    async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
      calls.push(name);
      return (name === "claim_push_jobs" ? [job] : name === "reserve_push_message" ? args.p_message_id : name === "push_job_allowed" ? false : null) as T;
    }, async () => { sends++; return 201; });
  assert.equal(sends, 0);
  assert.equal((await response.json()).expired, 1);
  assert.deepEqual(calls, ["claim_push_jobs", "reserve_push_message", "push_job_allowed", "finish_push_job"]);
});
