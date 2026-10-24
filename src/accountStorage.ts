import { parseData, STORAGE_KEY } from "./model";
import { readWeightCache } from "./weightSync";
import { clearSyncAccount } from "./sync";

// Invalidate callbacks from requests that started before this account signed out.
const generations = new Map<string, number>();
export const accountStorageGeneration = (userId: string) =>
  generations.get(userId) ?? 0;

export function checkPendingWeights(userId: string) {
  const raw = localStorage.getItem(
    `${STORAGE_KEY}:account:${userId}:weight-sync`,
  );
  if (raw && readWeightCache(raw, []).pending.length)
    throw new Error(
      "Há pesos que ainda não foram salvos na conta. Abra Peso, sincronize ou resolva os registros pendentes e tente sair novamente.",
    );
}

export class PendingWorkoutLogoutError extends Error {
  constructor() {
    super("Há registros manuais que ainda não foram confirmados na conta. Ao sair, esses rascunhos serão descartados.");
  }
}
export function checkPendingWorkouts(userId: string) {
  const raw = localStorage.getItem(`${STORAGE_KEY}:account:${userId}`);
  if (!raw) return;
  let data;
  try { data = parseData(raw); } catch { return; }
  if (data.workouts.some((w) => w.method === "manual" && !w.confirmedAt))
    throw new PendingWorkoutLogoutError();
}

export function clearAccountStorage(userId: string) {
  generations.set(userId, accountStorageGeneration(userId) + 1);
  clearSyncAccount(userId);
  const prefix = `${STORAGE_KEY}:account:${userId}`;
  // The unscoped legacy visitor archive is recoverable, never an account cache.
  const personalKey = (key: string) =>
    key === prefix ||
    key.startsWith(`${prefix}:`) ||
    key === `fokus-push:${userId}` ||
    key === "fokus-push:guest";
  for (const storage of [localStorage, sessionStorage]) {
    const keys = Array.from(
      { length: storage.length },
      (_, i) => storage.key(i)!,
    );
    keys.filter(personalKey).forEach((key) => storage.removeItem(key));
  }
}
