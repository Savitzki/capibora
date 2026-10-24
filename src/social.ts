import type { Profile } from "./profile";
import { useEffect, useRef } from "react";
import { backendRpc } from "./backend";
import {
  STORAGE_KEY,
  freshData,
  localDate,
  parseData,
  validDate,
  type Workout,
} from "./model";
import { dateInTimezone } from "./training";
import { validManualConfirmation } from "./manualConfirmation";
import { useSyncedResource } from "./useSyncedResource";
import { invalidateSync, notifySyncWrite, withSync, syncProblem, transientSyncError } from "./sync";

export type GroupGoal = {
  weekStart: string;
  startsOn: string;
  timezone: string;
  target: number;
  completed: number;
  closed: boolean;
};
/** Server capacity: accepted members and pending invitations both occupy a slot. */
export const GROUP_MEMBER_LIMIT = 5;
export type SocialState = {
  arenaVersion?: number;
  tauntNotices?: boolean;
  tauntAllowance?: {
    day: string;
    checkedAt: string;
    resetsAt: string;
    sentTo: string[];
  };
  code: string;
  workouts: Workout[];
  friends: { id: string; nickname: string; frame?: string; avatar?: Profile }[];
  requests: { id: string; nickname: string; incoming: boolean }[];
  groups: {
    id: string;
    adminId?: string;
    goals?: GroupGoal[];
    name: string;
    timezone: string;
    status: "pending" | "active";
    invited: boolean;
    today: string;
    streak: number;
    best: number;
    completed: boolean;
    resting?: boolean;
    completedAt?: string | null;
    members: {
      id: string;
      nickname: string;
      frame?: string;
      avatar?: Profile;
      accepted: boolean;
      trained: boolean;
      resting?: boolean;
      needsPlan?: boolean;
      rescheduledTo?: string | null;
      rescheduledFrom?: string | null;
      confirmedAt?: string | null;
    }[];
  }[];
};
export const deviceTimezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function rankGroupMembers(
  members: SocialState["groups"][number]["members"],
) {
  const stamp = (member: (typeof members)[number]) => {
    if (
      !member.accepted ||
      member.resting ||
      !member.trained ||
      !member.confirmedAt ||
      !Number.isFinite(Date.parse(member.confirmedAt))
    )
      return null;
    // PostgreSQL keeps microseconds; Date alone would turn close finishes into ties.
    const seconds = new Date(member.confirmedAt).toISOString().slice(0, 19);
    const fraction = (member.confirmedAt.match(/\.(\d+)/)?.[1] ?? "")
      .padEnd(6, "0")
      .slice(0, 6);
    return `${seconds}.${fraction}`;
  };
  const sorted = [...members].sort((a, b) => {
    const left = stamp(a),
      right = stamp(b);
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return sorted.map((member) => ({
    ...member,
    place:
      stamp(member) !== null
        ? sorted.filter(
            (other) => stamp(other) !== null && stamp(other)! < stamp(member)!,
          ).length + 1
        : null,
  }));
}

type SocialSnapshot = SocialState & { syncError?: string };
function readSocialState(value: unknown): SocialSnapshot {
  const s = value as SocialSnapshot;
  if (
    !s ||
    typeof s.code !== "string" ||
    (s.arenaVersion !== undefined && ![1, 2].includes(s.arenaVersion)) ||
    (s.tauntNotices !== undefined && typeof s.tauntNotices !== "boolean") ||
    ![s.workouts, s.friends, s.requests, s.groups].every(Array.isArray)
  )
    throw new Error("Não foi possível atualizar sua Arena");
  if (
    s.tauntAllowance &&
    (!validDate(s.tauntAllowance.day) ||
      !Number.isFinite(Date.parse(s.tauntAllowance.checkedAt)) ||
      !Number.isFinite(Date.parse(s.tauntAllowance.resetsAt)) ||
      !Array.isArray(s.tauntAllowance.sentTo) ||
      !s.tauntAllowance.sentTo.every((id) => typeof id === "string"))
  )
    throw new Error("Não foi possível atualizar as provocações");
  const person = (p: { id: string; nickname: string }) =>
    p && typeof p.id === "string" && typeof p.nickname === "string";
  if (
    !s.friends.every(person) ||
    !s.requests.every((p) => person(p) && typeof p.incoming === "boolean") ||
    !s.groups.every(
      (g) =>
        g &&
        typeof g.id === "string" &&
        typeof g.name === "string" &&
        (g.adminId === undefined || typeof g.adminId === "string") &&
        (g.goals === undefined ||
          (Array.isArray(g.goals) &&
            g.goals.every(
              (goal) =>
                validDate(goal.weekStart) &&
                validDate(goal.startsOn) &&
                Number.isSafeInteger(goal.target) &&
                goal.target >= 0 &&
                Number.isSafeInteger(goal.completed) &&
                goal.completed >= 0 &&
                typeof goal.closed === "boolean" &&
                typeof goal.timezone === "string",
            ))) &&
        Array.isArray(g.members) &&
        g.members.every(person),
    )
  )
    throw new Error("Não foi possível atualizar sua Arena");
  s.groups.forEach((g) => {
    if (g.timezone) new Intl.DateTimeFormat("pt-BR", { timeZone: g.timezone });
  });
  parseData(JSON.stringify({ ...freshData(), workouts: s.workouts }));
  return s;
}
export function useSocial(
  enabled: boolean,
  workouts: Workout[],
  onRemote: (remote: Workout[], confirmed?: Workout) => void,
  timezone?: string,
  serverDay?: string,
  userId: string | null = null,
) {
  const latest = useRef({ workouts, onRemote });
  latest.current = { workouts, onRemote };
  const acknowledged = useRef<string | null>(null);
  const today =
    serverDay ??
    (timezone ? dateInTimezone(new Date(), timezone) : localDate());
  const identity = userId ?? (enabled ? "legacy-social" : null);
  const rejectionKey = userId ? `${STORAGE_KEY}:account:${userId}:manual-rejection` : null;
  const rejected = useRef<{ identity: string | null; signature: string; message: string } | null>(null);
  function rememberRejection(value: { signature: string; message: string } | null) {
    rejected.current = value ? { identity, ...value } : null;
    if (rejectionKey) try {
      if (value) localStorage.setItem(rejectionKey, JSON.stringify(value));
      else localStorage.removeItem(rejectionKey);
    } catch { /* Memory still prevents automatic retries during this visit. */ }
  }
  const resource = useSyncedResource<SocialSnapshot>({
    userId: identity,
    resource: "social",
    queryKey: "social",
    enabled,
    cacheKey: userId ? `${STORAGE_KEY}:account:${userId}:social` : undefined,
    parse: readSocialState,
    read: async () => {
      const pending = latest.current.workouts.find(
        (w) =>
          w.date === today &&
          !w.confirmedAt &&
          w.method === "manual" &&
          validManualConfirmation(w.manualConfirmation),
      );
      const signature = pending ? JSON.stringify([pending.id, pending.date, pending.activity, pending.minutes, pending.manualConfirmation]) : "";
      let refusal = rejected.current?.identity === identity ? rejected.current : null;
      if (!refusal && rejectionKey) try {
        const stored = JSON.parse(localStorage.getItem(rejectionKey) ?? "null");
        if (stored && typeof stored.signature === "string" && typeof stored.message === "string")
          refusal = { identity, signature: stored.signature, message: stored.message.slice(0, 512) };
      } catch { /* Invalid receipts cannot confirm or reject server data. */ }
      if (refusal?.signature !== signature) refusal = null;
      let syncError = refusal?.message ?? "";
      let pendingFailure: unknown;
      if (pending && !refusal) {
        try {
          const confirmed = await backendRpc<Workout>(
            "confirm_manual_workout",
            {
              p_request_id: pending.id,
              p_day: pending.date,
              p_activity: pending.activity,
              p_minutes: pending.minutes,
              p_confirmation: pending.manualConfirmation,
              p_timezone: timezone ?? deviceTimezone(),
            },
          );
          if (resource.isCurrent() && confirmed?.confirmedAt) {
            acknowledged.current = confirmed.id;
            latest.current.onRemote([confirmed], confirmed);
            notifySyncWrite(userId, "confirm_manual_workout", "social");
          }
        } catch (e) {
          pendingFailure = e;
          syncError = (e as Error).message;
          if (resource.isCurrent() && syncProblem(e).kind === "validation")
            rememberRejection({ signature, message: syncError.slice(0, 512) });
        }
      }
      const next = readSocialState(await backendRpc("get_social_state"));
      if (resource.isCurrent() && (!pending || next.workouts.some((w) => w.date === pending.date)))
        rememberRejection(null);
      // Another device may already have confirmed the same day. Recover that
      // authoritative record before retrying a local declaration.
      if (pendingFailure && !next.workouts.some((w) => w.date === pending?.date) &&
        transientSyncError(syncProblem(pendingFailure).kind)) throw pendingFailure;
      return {
        ...next,
        syncError: next.workouts.some((w) => w.date === pending?.date)
          ? ""
          : syncError,
      };
    },
    onData(next, previous) {
      latest.current.onRemote(next.workouts);
      if (
        previous &&
        JSON.stringify(next.workouts) !== JSON.stringify(previous.workouts)
      ) {
        const changed = next.workouts.filter(
          (w) =>
            !previous.workouts.some(
              (p) => JSON.stringify(p) === JSON.stringify(w),
            ),
        );
        if (changed.some((w) => w.id !== acknowledged.current))
          invalidateSync(userId, [
            "training",
            "economy",
            "gamification",
            "reports",
            "challenges",
            "session",
          ]);
      }
      if (
        previous &&
        (JSON.stringify(next.friends) !== JSON.stringify(previous.friends) ||
          JSON.stringify(next.groups.map((g) => [g.id, g.status])) !==
            JSON.stringify(previous.groups.map((g) => [g.id, g.status])))
      )
        invalidateSync(userId, ["gamification", "challenges"]);
      acknowledged.current = null;
    },
  });
  // Server-derived deadline; refresh once at account midnight, including long-open PWAs.
  const resetAt = resource.state?.tauntAllowance?.resetsAt;
  const checkedAt = resource.state?.tauntAllowance?.checkedAt;
  useEffect(() => {
    if (!enabled || !resetAt || !checkedAt || !resource.sync.lastSuccess)
      return;
    const remaining =
      Date.parse(resetAt) -
      Date.parse(checkedAt) -
      (Date.now() - resource.sync.lastSuccess);
    const timer = window.setTimeout(
      () => void resource.refresh(),
      Math.max(1000, Math.min(remaining + 100, 86400100)),
    );
    return () => window.clearTimeout(timer);
  }, [
    enabled,
    identity,
    resetAt,
    checkedAt,
    resource.sync.lastSuccess,
    resource.refresh,
  ]);
  const previousPending = useRef({
    identity,
    id: workouts.find(
      (w) =>
        w.date === today &&
        !w.confirmedAt &&
        w.method === "manual" &&
        validManualConfirmation(w.manualConfirmation),
    )?.id,
  });
  const pendingWorkout = workouts.find(
    (w) =>
      w.date === today &&
      !w.confirmedAt &&
      w.method === "manual" &&
      validManualConfirmation(w.manualConfirmation),
  );
  useEffect(() => {
    if (
      previousPending.current.identity === identity &&
      previousPending.current.id === pendingWorkout?.id
    )
      return;
    const sameAccount = previousPending.current.identity === identity;
    previousPending.current = { identity, id: pendingWorkout?.id };
    // The first read already includes an existing queue; only newly queued entries invalidate it.
    if (pendingWorkout && sameAccount) invalidateSync(identity, ["social"]);
  }, [pendingWorkout?.id, identity]);
  const pending = Boolean(
    pendingWorkout && !resource.state?.workouts.some((w) => w.date === today),
  );
  return withSync(
    {
      state: resource.state,
      error: resource.error || resource.state?.syncError || "",
      busy: resource.busy,
      pending,
      refresh: resource.refresh,
      act: async (name: string, args: Record<string, unknown>) =>
        (await resource.mutate(() => backendRpc(name, args), name, false))
          .committed,
    },
    resource.sync,
  );
}
