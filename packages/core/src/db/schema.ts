/**
 * Kysely table shapes, kept dialect-honest (SQLite-native representations —
 * booleans and timestamps as they actually come back from `node:sqlite`).
 * Domain-facing code never touches these directly; see `user-repository.ts`
 * for the translation to the camelCase `TelekitUser` shape (ADR-002).
 */

export type UserStatus = "active" | "blocked" | "deleted" | "banned";

export interface UsersTable {
  id: number;
  first_name: string;
  last_name: string | null;
  username: string | null;
  language_code: string | null;
  locale: string | null;
  is_premium: number;
  is_bot: number;
  status: UserStatus;
  source: string | null;
  joined_at: string;
  last_seen_at: string;
  messages_count: number;
  commands_count: number;
  attributes: string;
  banned_at: string | null;
  banned_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionsTable {
  key: string;
  data: string;
  version: number;
  expires_at: string | null;
  updated_at: string;
}

export interface CallbackRefsTable {
  id: string;
  route: string;
  payload: Uint8Array;
  chat_id: number | null;
  user_id: number | null;
  created_at: string;
  expires_at: string;
}

export interface TelekitDatabase {
  telekit_users: UsersTable;
  telekit_sessions: SessionsTable;
  telekit_callback_refs: CallbackRefsTable;
}
