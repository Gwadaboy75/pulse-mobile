export const BACKFILL_DAYS = 180;

// Optional and retired jobs must not hold the import open when Google rejects them.
export const CORE_SYNC_TYPES = new Set([
  "heart-rate",
  "steps",
  "steps-daily",
  "sleep",
  "daily-heart-rate-variability",
  "daily-resting-heart-rate",
  "daily-respiratory-rate",
  "daily-sleep-temperature-derivations",
  "daily-oxygen-saturation",
  "exercise",
  "daily-vo2-max",
  "run-vo2-max",
  "total-calories",
  "weight",
  "body-fat",
]);

type ProgressRow = {
  type: string;
  backfillDaysDone: number | null;
  backfillDaysTotal: number | null;
};

export function importProgress(all: readonly ProgressRow[]): { done: number; total: number } | null {
  const rows = new Map(all.filter((row) => CORE_SYNC_TYPES.has(row.type)).map((row) => [row.type, row]));
  if (![...rows.values()].some((row) => row.backfillDaysTotal != null)) return null;
  let completed = 0;
  for (const type of CORE_SYNC_TYPES) {
    const row = rows.get(type);
    const days = Math.max(1, row?.backfillDaysTotal ?? BACKFILL_DAYS);
    completed += Math.max(0, Math.min(days, row?.backfillDaysDone ?? 0)) / days;
  }
  if (completed >= CORE_SYNC_TYPES.size) return null;
  return { done: Math.floor(completed * BACKFILL_DAYS / CORE_SYNC_TYPES.size), total: BACKFILL_DAYS };
}
