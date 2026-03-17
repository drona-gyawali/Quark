import Database from "better-sqlite3";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const DIR = path.join(os.homedir(), ".learnrag");
export const DB_FILE = path.join(DIR, "users.db");
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT    NOT NULL UNIQUE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label       TEXT    NOT NULL DEFAULT 'session',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    last_active TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS chat_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT    NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    role       TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ingest_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT    NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    file_name     TEXT    NOT NULL,
    chunks        INTEGER NOT NULL DEFAULT 0,
    visual_chunks INTEGER NOT NULL DEFAULT 0,
    institution   TEXT,
    course        TEXT,
    status        TEXT    NOT NULL DEFAULT 'ok',
    error_msg     TEXT,
    ingested_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

export interface DBUser {
  id: number;
  username: string;
  created_at: string;
}
export interface DBSession {
  id: number;
  session_id: string;
  user_id: number;
  label: string;
  last_active: string;
}
export interface DBChat {
  id: number;
  session_id: string;
  role: string;
  content: string;
  created_at: string;
}
export interface DBIngest {
  id: number;
  session_id: string;
  file_name: string;
  chunks: number;
  visual_chunks: number;
  institution: string;
  course: string;
  status: string;
  error_msg: string | null;
  ingested_at: string;
}

const q = {
  upsert: db.prepare<[string]>(
    `INSERT OR IGNORE INTO users (username) VALUES (?)`,
  ),
  getUser: db.prepare<[string]>(`SELECT * FROM users WHERE username = ?`),
  allUsernames: db.prepare(
    `SELECT username FROM users ORDER BY created_at DESC LIMIT 8`,
  ),
  createSess: db.prepare<[string, number, string]>(
    `INSERT INTO sessions (session_id, user_id, label) VALUES (?, ?, ?)`,
  ),
  touchSess: db.prepare<[string]>(
    `UPDATE sessions SET last_active = datetime('now') WHERE session_id = ?`,
  ),
  userSessions: db.prepare<[number]>(
    `SELECT * FROM sessions WHERE user_id = ? ORDER BY last_active DESC LIMIT 10`,
  ),
  deleteSess: db.prepare<[string]>(`DELETE FROM sessions WHERE session_id = ?`),
  appendChat: db.prepare<[string, string, string]>(
    `INSERT INTO chat_log (session_id, role, content) VALUES (?, ?, ?)`,
  ),
  getChat: db.prepare<[string]>(
    `SELECT * FROM chat_log WHERE session_id = ? ORDER BY created_at ASC`,
  ),
  clearChat: db.prepare<[string]>(`DELETE FROM chat_log WHERE session_id = ?`),
  logIngest: db.prepare<[string, string, number, number, string, string]>(
    `INSERT INTO ingest_log (session_id, file_name, chunks, visual_chunks, institution, course) VALUES (?, ?, ?, ?, ?, ?)`,
  ),
  logIngestErr: db.prepare<[string, string, string]>(
    `INSERT INTO ingest_log (session_id, file_name, status, error_msg) VALUES (?, ?, 'err', ?)`,
  ),
  getIngests: db.prepare<[string]>(
    `SELECT * FROM ingest_log WHERE session_id = ? ORDER BY ingested_at DESC LIMIT 20`,
  ),
};

export const upsertUser = (u: string): DBUser => {
  q.upsert.run(u);
  return q.getUser.get(u) as DBUser;
};
export const allUsernames = (): string[] =>
  (q.allUsernames.all() as any[]).map((r) => r.username);
export const createSession = (sid: string, uid: number, label: string) =>
  q.createSess.run(sid, uid, label);
export const touchSession = (sid: string) => q.touchSess.run(sid);
export const getUserSessions = (uid: number): DBSession[] =>
  q.userSessions.all(uid) as DBSession[];
export const deleteSession = (sid: string) => q.deleteSess.run(sid);
export const appendChat = (sid: string, role: string, content: string) => {
  q.appendChat.run(sid, role, content);
  touchSession(sid);
};
export const getChat = (sid: string): DBChat[] =>
  q.getChat.all(sid) as DBChat[];
export const clearChat = (sid: string) => q.clearChat.run(sid);
export const logIngest = (
  sid: string,
  file: string,
  c: number,
  v: number,
  inst: string | null = null,
  course: string | null = null,
) => q.logIngest.run(sid, file, c, v, inst as string, course as string);
export const logIngestErr = (sid: string, file: string, err: string) =>
  q.logIngestErr.run(sid, file, err);
export const getIngests = (sid: string): DBIngest[] =>
  q.getIngests.all(sid) as DBIngest[];
