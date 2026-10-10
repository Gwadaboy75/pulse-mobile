// The coach's stored state: consent, provider and model, the key's last four characters (the key itself is in the
// secure store) and the chats. Replaces the database parts of pulse src/server/coach/store.ts and push.ts's brief
// claim. Every write is diff-only where it can repeat.
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { coachChats, coachSettings } from "../schema";
import type { Db } from "../types";
import { anyDiffers, excluded } from "./sql";

export type CoachSettingsRow = {
  consentAt: number | null;
  provider: string | null;
  model: string | null;
  keyLast4: string | null;
  customInstructions: string | null;
  /** Minutes after local midnight for the "brief ready" notification; null = off. */
  briefMinute: number | null;
  lastBriefDay: string | null;
  updatedAt: number;
};

/** The AI SDK's UIMessage[]; `unknown` until the `ai` package is installed (stream K). */
export type ChatMessages = unknown[];

export type ChatRow = { id: string; title: string; updatedAt: number };
/** Where the next page starts: the last chat shown (newest first, ties broken by id). store.ts:127 */
export type ChatCursor = { updatedAt: number; id: string };
/** Chats per page in the chat list. store.ts:124 */
export const CHAT_PAGE = 30;

export interface CoachRepo {
  /** The stored settings, or null before any. store.ts:57 `coachSetup`, :106 `coachModel`, push.ts:113 `notifyBrief` */
  getSettings(): Promise<CoachSettingsRow | null>;
  /** Sets or clears consent. store.ts:61 `setConsent` */
  setConsent(on: boolean, now: number): Promise<void>;
  /** Sets the keys present in `p` (null clears). store.ts:70 `setPreferences` */
  setPreferences(p: { instructions?: string | null; briefMinute?: number | null }, now: number): Promise<void>;
  /** Stores provider, model and the key's last four characters (null for a provider that needs no key). store.ts:76 `saveProvider` */
  saveProvider(provider: string, model: string, keyLast4: string | null, now: number): Promise<void>;
  /** Clears provider, model and key_last4. store.ts:89 `removeProvider` */
  removeProvider(now: number): Promise<void>;
  /** The atomic once-a-day claim of the brief: true only when last_brief_day was unset or earlier than `day`. push.ts:123 */
  claimBriefDay(day: string): Promise<boolean>;

  /** One page of chats, newest first, after `before` when given; `next` is the cursor for the page after, if any. store.ts:130 `listChats` */
  listChats(before?: ChatCursor): Promise<{ chats: ChatRow[]; next: ChatCursor | null }>;
  /** store.ts:166 `loadChat` */
  loadChat(id: string): Promise<ChatMessages | null>;
  /** Upserts a chat; the title and updatedAt follow the call (createdAt is kept on update). store.ts:178 `saveChat` */
  saveChat(id: string, title: string, messages: ChatMessages, now: number): Promise<void>;
  /**
   * Replaces the chat's messages only if they still equal `before` (compared as the JSON text the caller stored), so
   * one answer to a confirmation applies once. False when it no longer matches. store.ts:191 `claimChat`
   */
  claimChat(id: string, before: ChatMessages, after: ChatMessages, now: number): Promise<boolean>;
  /** store.ts:200 */
  deleteChat(id: string): Promise<void>;
  /** store.ts:204 */
  deleteAllChats(): Promise<void>;
  /** Every chat with its messages, newest first, for the coach export. app/export/coach/route.ts:14 */
  exportChats(): Promise<{ id: string; title: string; createdAt: number; updatedAt: number; messages: ChatMessages }[]>;
}

export function coachRepo(db: Db): CoachRepo {
  const c = coachSettings;
  const ch = coachChats;
  const read = () => db.select().from(c).where(eq(c.id, 1)).all()[0] ?? null;
  /**
   * Writes the given fields (and `updatedAt`) unless the row already holds them: `updatedAt` alone never counts, so a
   * repeat call writes nothing (pulse bumped `updated_at` each time; nothing reads it for that).
   */
  const patch = (values: Partial<Omit<CoachSettingsRow, "updatedAt">>, now: number) => {
    const held = read();
    if (held && (Object.keys(values) as (keyof typeof values)[]).every((k) => held[k] === values[k])) return;
    const row = { ...values, updatedAt: now };
    db.insert(c).values({ id: 1, ...row }).onConflictDoUpdate({ target: c.id, set: row }).run();
  };
  const chatBy = (id: string) => db.select({ messages: ch.messages }).from(ch).where(eq(ch.id, id)).all()[0];

  return {
    async getSettings() {
      return read();
    },
    async setConsent(on, now) {
      // Already consented: keep the time of the first consent.
      patch({ consentAt: on ? (read()?.consentAt ?? now) : null }, now);
    },
    async setPreferences(p, now) {
      patch({ ...("instructions" in p && { customInstructions: p.instructions }), ...("briefMinute" in p && { briefMinute: p.briefMinute }) }, now);
    },
    async saveProvider(provider, model, keyLast4, now) {
      patch({ provider, model, keyLast4 }, now);
    },
    async removeProvider(now) {
      if (read()) patch({ provider: null, model: null, keyLast4: null }, now);
    },
    async claimBriefDay(day) {
      const claimed = db
        .update(c)
        .set({ lastBriefDay: day })
        .where(and(eq(c.id, 1), or(isNull(c.lastBriefDay), lt(c.lastBriefDay, day))))
        .returning({ id: c.id })
        .all();
      return claimed.length > 0;
    },

    async listChats(before) {
      const rows = db
        .select({ id: ch.id, title: ch.title, updatedAt: ch.updatedAt })
        .from(ch)
        .where(before && or(lt(ch.updatedAt, before.updatedAt), and(eq(ch.updatedAt, before.updatedAt), lt(ch.id, before.id))))
        .orderBy(desc(ch.updatedAt), desc(ch.id))
        .limit(CHAT_PAGE + 1)
        .all();
      const chats = rows.slice(0, CHAT_PAGE);
      const last = chats.at(-1);
      return { chats, next: rows.length > CHAT_PAGE && last ? { updatedAt: last.updatedAt, id: last.id } : null };
    },
    async loadChat(id) {
      return (chatBy(id)?.messages as ChatMessages | undefined) ?? null;
    },
    async saveChat(id, title, messages, now) {
      // The title follows the first question, so editing it renames the chat. Unchanged title and messages: not written.
      db.insert(ch)
        .values({ id, title, messages, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: ch.id, set: { title: excluded(ch.title), messages: excluded(ch.messages), updatedAt: excluded(ch.updatedAt) }, setWhere: anyDiffers([ch.title, ch.messages]) })
        .run();
    },
    async claimChat(id, before, after, now) {
      // Compared as the JSON text the caller stored (a plain `=` on text; the column's own encoder would quote it again).
      const rows = db
        .update(ch)
        .set({ messages: after, updatedAt: now })
        .where(and(eq(ch.id, id), sql`${ch.messages} = ${JSON.stringify(before)}`))
        .returning({ id: ch.id })
        .all();
      return rows.length === 1;
    },
    async deleteChat(id) {
      db.delete(ch).where(eq(ch.id, id)).run();
    },
    async deleteAllChats() {
      db.delete(ch).run();
    },
    async exportChats() {
      return db.select().from(ch).orderBy(desc(ch.updatedAt), desc(ch.id)).all() as { id: string; title: string; createdAt: number; updatedAt: number; messages: ChatMessages }[];
    },
  };
}
