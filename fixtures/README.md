# Parity fixtures

Exported from pulse at commit `e43e85a6649ec7a10e74430dc1514090d89a37d8` (`SCORING_VERSION` 10). Every file carries
`generatedFrom` and `scoringVersion`. Loaders: `src/testing/fixtures.ts`; canonical encoding and hashes:
`src/testing/canonical.ts`. Database columns keep pulse's snake_case names, without `user_id`.

- `f1-mappers.json`: F1. For each Google payload in pulse's `src/server/sources/google/__fixtures__`: the file, the payload, the `map.ts` mapper and its arguments, and the rows it returns (a `Map` as its entries).
- `f2-seed.json`: F2. The 180-day demo seed as input rows per table (seeded at `now`, before any recompute), plus the pipeline options (time zone, profile).
- `f3-scores.json`: F3. Every `daily_scores`, `intraday_series` and `reports` row after a full recompute of F2, canonical (sorted keys, 10 significant digits), in hash order, with the per-column `hashes` (equal to pulse's `GOLDEN[10]`).
- `f4-incremental.json`: F4. The 220-day seed of `incremental.test.ts`, the late night for day 200 held back then restored, the rows after the incremental recompute (canonical, equal to a full fold), their hashes, and the checkpoint day used.
- `f5-time.json`: F5. `wall`, `localMidnight`, `fromWall`, `localMinutes` and `utcOffsetS` from pulse's `src/server/time.ts` for every zone in `time.test.ts`, on the days its `checkZone` walks in 2020 to 2030, including DST gaps and repeats.
- `f6-viewmodels.json`: F6. `HomeVM`, `SleepVM`, `RecoveryVM`, `StrainVM` and `MetricDetailVM` (six metric keys) on four days of the F3 database at a fixed `now`, canonical, with the context used.

## Regenerate

From a pulse checkout with `pnpm install` done, once per `SCORING_VERSION`:

```bash
pnpm dlx tsx@4.23.15 scripts/export-mobile-fixtures.mts <path to pulse-mobile>/fixtures
```

The script fails if the F3 hashes differ from `GOLDEN[SCORING_VERSION]` in `golden.test.ts`, or if the F4 incremental
recompute differs from a full fold. Commit pulse first: an uncommitted tree stamps `generatedFrom` with `-dirty`.
