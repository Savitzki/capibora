import type { Workout, WorkoutReview } from "./model";
export const WORKOUT_ACTIVITIES = [
  "Musculação",
  "Caminhada",
  "Corrida",
  "Ciclismo",
  "Natação",
  "Yoga",
  "Pilates",
  "Funcional",
  "Outro treino",
];
export const METHOD_NAMES = {
  legacy: "Registro anterior",
  manual: "Manual",
  timed: "Cronometrado",
};
export const FEELING_NAMES = {
  tired: "Cansado",
  normal: "Normal",
  great: "Muito bem",
};
export const COMPLETION_NAMES = {
  full: "Sim, fiz tudo que pretendia",
  partial: "Parcialmente, fiz menos que o planejado",
  adapted: "Mudei o treino durante a atividade",
};
export type WorkoutSession = {
  id: string;
  activity: string;
  startedAt: string;
  endedAt: string | null;
  validatedSeconds: number | null;
  minimumSeconds: number;
  maximumSeconds: number;
  status: "active" | "completed" | "cancelled" | "expired";
  workout: Workout | null;
};
export type RecordingState = {
  serverNow: string;
  today: string;
  timezone: string;
  minimumMinutes: number;
  maximumMinutes: number;
  session: WorkoutSession | null;
};
/** Presentation only; confirmation and the definitive day remain server-owned. */
export function minimumCrossesMidnight(state: RecordingState, elapsedSeconds = 0) {
  const start = Date.parse(state.serverNow) + Math.max(0, elapsedSeconds) * 1000;
  try {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: state.timezone, year: "numeric", month: "2-digit", day: "2-digit",
    });
    return day.format(start) !== day.format(start + state.minimumMinutes * 60000);
  } catch {
    return false;
  }
}
export function validReview(value: unknown): value is WorkoutReview {
  const r = value as WorkoutReview;
  return Boolean(
    r &&
      Number.isInteger(r.intensity) &&
      r.intensity >= 1 &&
      r.intensity <= 5 &&
      Object.hasOwn(FEELING_NAMES, r.feeling) &&
      Object.hasOwn(COMPLETION_NAMES, r.completion),
  );
}
export function readRecordingState(value: unknown): RecordingState {
  const r = value as RecordingState;
  if (
    !r ||
    !Number.isFinite(Date.parse(r.serverNow)) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(r.today) ||
    !r.timezone ||
    !Number.isInteger(r.minimumMinutes) ||
    r.minimumMinutes < 1 ||
    !Number.isInteger(r.maximumMinutes) ||
    r.maximumMinutes <= r.minimumMinutes ||
    (r.session &&
      (!r.session.id ||
        !r.session.activity ||
        !Number.isFinite(Date.parse(r.session.startedAt)) ||
        !["active", "completed", "cancelled", "expired"].includes(
          r.session.status,
        ) ||
        !Number.isInteger(r.session.minimumSeconds) ||
        r.session.minimumSeconds < 1 ||
        !Number.isInteger(r.session.maximumSeconds) ||
        r.session.maximumSeconds <= r.session.minimumSeconds ||
        (r.session.status === "completed" && !r.session.workout?.confirmedAt)))
  )
    throw new Error("Não foi possível recuperar seu treino. Tente atualizar");
  return r;
}
export function sessionSeconds(state: RecordingState, elapsedSinceSync = 0) {
  const s = state.session;
  if (!s) return 0;
  if (s.validatedSeconds !== null) return s.validatedSeconds;
  const end = s.endedAt ?? state.serverNow;
  return Math.max(
    0,
    Math.min(
      s.maximumSeconds,
      Math.floor(
        (Date.parse(end) - Date.parse(s.startedAt)) / 1000 +
          (s.status === "active" ? Math.max(0, elapsedSinceSync) : 0),
      ),
    ),
  );
}
export function timerText(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
