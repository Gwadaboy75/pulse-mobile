// The coach's stored state: consent, provider and model, the key's last four characters (the key itself is in the
// secure store) and the chats. Replaces the database parts of pulse src/server/coach/store.ts and push.ts's brief
// claim. Every write is diff-only where it can repeat.
import type { Db } from "../types";
import { todo } from "./todo";

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

export function coachRepo(_db: Db): CoachRepo {
  return {
    getSettings: async () => todo("coachRepo.getSettings"),
    setConsent: async () => todo("coachRepo.setConsent"),
    setPreferences: async () => todo("coachRepo.setPreferences"),
    saveProvider: async () => todo("coachRepo.saveProvider"),
    removeProvider: async () => todo("coachRepo.removeProvider"),
    claimBriefDay: async () => todo("coachRepo.claimBriefDay"),
    listChats: async () => todo("coachRepo.listChats"),
    loadChat: async () => todo("coachRepo.loadChat"),
    saveChat: async () => todo("coachRepo.saveChat"),
    claimChat: async () => todo("coachRepo.claimChat"),
    deleteChat: async () => todo("coachRepo.deleteChat"),
    deleteAllChats: async () => todo("coachRepo.deleteAllChats"),
    exportChats: async () => todo("coachRepo.exportChats"),
  };
}
