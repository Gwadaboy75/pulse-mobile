// The journal: behaviours (journal_tags), a day's answers (journal_entries) and notes (journal_notes). Replaces pulse
// queries/journal.ts, journalTags.ts, actions/journal.ts, export.ts and the journal reads in queries/{home,reports,settings}.ts
// and pipeline/stage2.ts. Every write is diff-only.
import { and, asc, count, eq, gte, inArray, lte, max, notInArray, sql } from "drizzle-orm";
import { journalEntries, journalNotes, journalTags } from "../schema";
import type { Db } from "../types";
import { atomic, upsertChanged } from "./sql";

/** A behaviour the check-in asks, in check-in order (position, then seq). */
export type JournalTagRow = { tag: string; label: string; isDefault: boolean; hidden: boolean; position: number; seq: number };
/** One (day, tag) answer: 1 for yes (or a count), 0 for no. `detail`: the follow-up answer, null when not asked or skipped. */
export type JournalEntryRow = { day: string; tag: string; value: number; detail: number | null };
export type JournalNoteRow = { day: string; text: string };

export interface JournalRepo {
  /** Every tag, hidden ones included, by position then insertion order (seq). queries/journal.ts:12 `tagsOf`, export.ts:53 */
  tags(): Promise<JournalTagRow[]>;
  /** The tag keys the user has. journalTags.ts:61 `selectTags` */
  tagKeys(): Promise<string[]>;
  /** True when the tag exists. actions/journal.ts:44 */
  hasTag(tag: string): Promise<boolean>;
  /** Total and shown (not hidden) behaviours. queries/settings.ts:154 `getMore` */
  tagCounts(): Promise<{ total: number; shown: number }>;
  /** Inserts the missing default tags (isDefault true, in the given order); existing rows stay. Returns the rows inserted. journalTags.ts:20 */
  ensureDefaultTags(defaults: { tag: string; label: string }[]): Promise<number>;
  /**
   * Adds a custom tag at the end (position = max position + 1, seq = max seq + 1). "exists" when the key is taken,
   * "full" when the user already has `max` tags; the count check and the insert are one statement. journalTags.ts:40 `addTag`
   */
  addTag(tag: string, label: string, max: number): Promise<"added" | "exists" | "full">;
  /** Adds catalogue behaviours the user has no row for, at the end in the given order; existing rows stay. journalTags.ts:68 */
  addTags(rows: { tag: string; label: string }[]): Promise<void>;
  /** Shows the given tags and hides every other; a tag already in that state is not written. journalTags.ts:70-71 */
  showOnly(tags: string[]): Promise<void>;

  /** Answers for days in [from, to], by day then tag. queries/journal.ts:27 `entriesBetween` */
  entriesBetween(from: string, to: string): Promise<JournalEntryRow[]>;
  /** The days in [from, to] with any answer. queries/home.ts:172 `journalWeek` */
  entryDays(from: string, to: string): Promise<string[]>;
  /** Every answer's day, tag and value, ordered by day then tag in byte order (the order is part of journal impact's memo key). pipeline/stage2.ts:251 */
  entriesForScoring(): Promise<{ day: string; tag: string; value: number }[]>;
  /** Number of answers. queries/settings.ts:185 `getYourData` */
  answerCount(): Promise<number>;
  /** Upserts one (day, tag) answer; true when anything changed (diff-only, so repeating it returns false). actions/journal.ts:49 */
  saveEntry(entry: JournalEntryRow): Promise<boolean>;
  /** Removes an answer ("not answered" is different from an answered no). actions/journal.ts:47 */
  deleteEntry(day: string, tag: string): Promise<void>;
  /** Answers joined to their labels (label falls back to the tag), by day then tag, for the export. export.ts:34 `journalTable` */
  entriesWithLabels(): Promise<(JournalEntryRow & { label: string })[]>;

  /** A day's note text, or null. queries/journal.ts:22 */
  noteOn(day: string): Promise<string | null>;
  /** Every note, by day. export.ts:46 `journalNoteList` */
  notes(): Promise<JournalNoteRow[]>;
  /** Upserts a day's note (the caller trims; blank means `deleteNote`). Diff-only. actions/journal.ts:94 */
  saveNote(day: string, text: string): Promise<void>;
  /** actions/journal.ts:93 */
  deleteNote(day: string): Promise<void>;
}

export function journalRepo(db: Db): JournalRepo {
  const t = journalTags;
  const e = journalEntries;
  const n = journalNotes;
  /** The next position and seq for a tag added at the end (seq is Postgres's `serial` in pulse). */
  const tail = () => {
    const [r] = db.select({ position: max(t.position), seq: max(t.seq) }).from(t).all();
    return { position: r?.position ?? 0, seq: r?.seq ?? 0 };
  };
  const present = () => new Set(db.select({ tag: t.tag }).from(t).all().map((r) => r.tag));

  return {
    async tags() {
      return db.select({ tag: t.tag, label: t.label, isDefault: t.isDefault, hidden: t.hidden, position: t.position, seq: t.seq }).from(t).orderBy(asc(t.position), asc(t.seq)).all();
    },
    async tagKeys() {
      return db.select({ tag: t.tag }).from(t).all().map((r) => r.tag);
    },
    async hasTag(tag) {
      return db.select({ tag: t.tag }).from(t).where(eq(t.tag, tag)).all().length > 0;
    },
    async tagCounts() {
      const [r] = db.select({ total: count(), shown: sql<number>`coalesce(sum(case when ${t.hidden} = 0 then 1 else 0 end), 0)` }).from(t).all();
      return { total: r.total, shown: Number(r.shown) };
    },

    async ensureDefaultTags(defaults) {
      return atomic(db, () => {
        const have = present();
        const { seq } = tail();
        const missing = defaults.filter((d) => !have.has(d.tag));
        missing.forEach((d, i) => db.insert(t).values({ tag: d.tag, label: d.label, isDefault: true, seq: seq + 1 + i }).run());
        return missing.length;
      });
    },

    async addTag(tag, label, cap) {
      // The count check lives in the insert itself, as in pulse; an aggregate subquery always yields one row.
      const added = db.all<{ tag: string }>(
        sql`insert into journal_tags (tag, label, position, seq)
          select ${tag}, ${label}, p + 1, s + 1 from (select count(*) c, coalesce(max(position), 0) p, coalesce(max(seq), 0) s from journal_tags)
          where c < ${cap}
          on conflict do nothing returning tag`,
      );
      if (added.length) return "added";
      const [{ c }] = db.select({ c: count() }).from(t).all();
      return c >= cap ? "full" : "exists";
    },

    async addTags(rows) {
      atomic(db, () => {
        const have = present();
        const { position, seq } = tail();
        rows
          .filter((r) => !have.has(r.tag))
          .forEach((r, i) => db.insert(t).values({ tag: r.tag, label: r.label, position: position + 1 + i, seq: seq + 1 + i }).run());
      });
    },

    async showOnly(tags) {
      atomic(db, () => {
        db.update(t).set({ hidden: true }).where(and(eq(t.hidden, false), notInArray(t.tag, tags.length ? tags : [""]))).run();
        if (tags.length) db.update(t).set({ hidden: false }).where(and(eq(t.hidden, true), inArray(t.tag, tags))).run();
      });
    },

    async entriesBetween(from, to) {
      return db.select({ day: e.day, tag: e.tag, value: e.value, detail: e.detail }).from(e).where(and(gte(e.day, from), lte(e.day, to))).orderBy(asc(e.day), asc(e.tag)).all();
    },
    async entryDays(from, to) {
      return db.selectDistinct({ day: e.day }).from(e).where(and(gte(e.day, from), lte(e.day, to))).orderBy(asc(e.day)).all().map((r) => r.day);
    },
    // Tags in byte order (SQLite's BINARY collation): their order is part of journal impact's memo key.
    async entriesForScoring() {
      return db.select({ day: e.day, tag: e.tag, value: e.value }).from(e).orderBy(asc(e.day), asc(e.tag)).all();
    },
    async answerCount() {
      return db.select({ n: count() }).from(e).all()[0].n;
    },
    async saveEntry(entry) {
      return upsertChanged(db, e, ["day", "tag"], [entry]).length > 0;
    },
    async deleteEntry(day, tag) {
      db.delete(e).where(and(eq(e.day, day), eq(e.tag, tag))).run();
    },
    async entriesWithLabels() {
      const rows = db
        .select({ day: e.day, tag: e.tag, label: t.label, value: e.value, detail: e.detail })
        .from(e)
        .leftJoin(t, eq(t.tag, e.tag))
        .orderBy(asc(e.day), asc(e.tag))
        .all();
      return rows.map((r) => ({ ...r, label: r.label ?? r.tag }));
    },

    async noteOn(day) {
      return db.select({ text: n.text }).from(n).where(eq(n.day, day)).all()[0]?.text ?? null;
    },
    async notes() {
      return db.select({ day: n.day, text: n.text }).from(n).orderBy(asc(n.day)).all();
    },
    async saveNote(day, text) {
      upsertChanged(db, n, ["day"], [{ day, text }]);
    },
    async deleteNote(day) {
      db.delete(n).where(eq(n.day, day)).run();
    },
  };
}
