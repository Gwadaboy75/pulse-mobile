// The journal: behaviours (journal_tags), a day's answers (journal_entries) and notes (journal_notes). Replaces pulse
// queries/journal.ts, journalTags.ts, actions/journal.ts, export.ts and the journal reads in queries/{home,reports,settings}.ts
// and pipeline/stage2.ts. Every write is diff-only.
import type { Db } from "../types";
import { todo } from "./todo";

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

export function journalRepo(_db: Db): JournalRepo {
  return {
    tags: async () => todo("journalRepo.tags"),
    tagKeys: async () => todo("journalRepo.tagKeys"),
    hasTag: async () => todo("journalRepo.hasTag"),
    tagCounts: async () => todo("journalRepo.tagCounts"),
    ensureDefaultTags: async () => todo("journalRepo.ensureDefaultTags"),
    addTag: async () => todo("journalRepo.addTag"),
    addTags: async () => todo("journalRepo.addTags"),
    showOnly: async () => todo("journalRepo.showOnly"),
    entriesBetween: async () => todo("journalRepo.entriesBetween"),
    entryDays: async () => todo("journalRepo.entryDays"),
    entriesForScoring: async () => todo("journalRepo.entriesForScoring"),
    answerCount: async () => todo("journalRepo.answerCount"),
    saveEntry: async () => todo("journalRepo.saveEntry"),
    deleteEntry: async () => todo("journalRepo.deleteEntry"),
    entriesWithLabels: async () => todo("journalRepo.entriesWithLabels"),
    noteOn: async () => todo("journalRepo.noteOn"),
    notes: async () => todo("journalRepo.notes"),
    saveNote: async () => todo("journalRepo.saveNote"),
    deleteNote: async () => todo("journalRepo.deleteNote"),
  };
}
