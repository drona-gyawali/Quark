import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ── Point DB_FILE at a temp location before the module loads ──────────────────
const TEST_DIR = path.join(os.tmpdir(), "learnrag-test");
const TEST_DB = path.join(TEST_DIR, "test-users.db");

// Patch the home-dir resolution so the module uses our temp DB
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, default: { ...actual, homedir: () => os.tmpdir() } };
});

import {
  upsertUser,
  allUsernames,
  createSession,
  touchSession,
  getUserSessions,
  deleteSession,
  appendChat,
  getChat,
  clearChat,
  logIngest,
  logIngestErr,
  getIngests,
  DB_FILE,
} from "./db.ts";

let sessionCounter = 0;
const uid = () => `sid-${++sessionCounter}-${Date.now()}`;

afterAll(() => {
  if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
});

describe("upsertUser / allUsernames", () => {
  it("creates a new user and returns their record", () => {
    const user = upsertUser("alice");
    expect(user.username).toBe("alice");
    expect(user.id).toBeTypeOf("number");
    expect(user.created_at).toBeTypeOf("string");
  });

  it("is idempotent – calling twice returns the same user", () => {
    const first = upsertUser("bob");
    const second = upsertUser("bob");
    expect(first.id).toBe(second.id);
  });

  it("allUsernames returns recently created usernames", () => {
    upsertUser("charlie");
    const names = allUsernames();
    expect(names).toContain("charlie");
  });

  it("allUsernames returns at most 8 entries", () => {
    for (let i = 0; i < 10; i++) upsertUser(`user${i}`);
    expect(allUsernames().length).toBeLessThanOrEqual(8);
  });
});

describe("createSession / getUserSessions / deleteSession", () => {
  it("creates a session linked to a user", () => {
    const user = upsertUser("dana");
    const sid = uid();
    createSession(sid, user.id, "my-label");

    const sessions = getUserSessions(user.id);
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    const s = sessions.find((s) => s.session_id === sid);
    expect(s).toBeDefined();
    expect(s!.label).toBe("my-label");
  });

  it("getUserSessions returns at most 10 sessions", () => {
    const user = upsertUser("multisess");
    for (let i = 0; i < 12; i++) {
      createSession(uid(), user.id, `label-${i}`);
    }
    expect(getUserSessions(user.id).length).toBeLessThanOrEqual(10);
  });

  it("deleteSession removes the session", () => {
    const user = upsertUser("eve");
    const sid = uid();
    createSession(sid, user.id, "temp");

    deleteSession(sid);
    const sessions = getUserSessions(user.id);
    expect(sessions.find((s) => s.session_id === sid)).toBeUndefined();
  });

  it("cascades delete to chat_log on session removal", () => {
    const user = upsertUser("frank");
    const sid = uid();
    createSession(sid, user.id, "cascade-test");
    appendChat(sid, "user", "hello");

    deleteSession(sid);
    expect(getChat(sid)).toHaveLength(0);
  });
});

describe("touchSession", () => {
  it("updates last_active without throwing", () => {
    const user = upsertUser("grace");
    const sid = uid();
    createSession(sid, user.id, "touch-test");
    expect(() => touchSession(sid)).not.toThrow();
  });
});

describe("appendChat / getChat / clearChat", () => {
  let sid: string;

  beforeEach(() => {
    const user = upsertUser("heidi");
    sid = uid();
    createSession(sid, user.id, "chat-test");
  });

  it("appends a message and retrieves it", () => {
    appendChat(sid, "user", "Hello!");
    const msgs = getChat(sid);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toBe("Hello!");
  });

  it("preserves insertion order", () => {
    appendChat(sid, "user", "first");
    appendChat(sid, "assistant", "second");
    appendChat(sid, "user", "third");

    const msgs = getChat(sid);
    expect(msgs.map((m) => m.content)).toEqual(["first", "second", "third"]);
  });

  it("clearChat removes all messages for the session", () => {
    appendChat(sid, "user", "will be cleared");
    clearChat(sid);
    expect(getChat(sid)).toHaveLength(0);
  });

  it("clearChat does not affect other sessions", () => {
    const user2 = upsertUser("ivan");
    const sid2 = uid();
    createSession(sid2, user2.id, "other");
    appendChat(sid2, "user", "keep me");

    appendChat(sid, "user", "delete me");
    clearChat(sid);

    expect(getChat(sid2)).toHaveLength(1);
  });
});

describe("logIngest / logIngestErr / getIngests", () => {
  let sid: string;

  beforeEach(() => {
    const user = upsertUser("judy");
    sid = uid();
    createSession(sid, user.id, "ingest-test");
  });

  it("logs a successful ingest and retrieves it", () => {
    logIngest(sid, "lecture1.pdf", 42, 5, "MIT", "6.001");
    const rows = getIngests(sid);
    expect(rows.length).toBeGreaterThanOrEqual(1);

    const row = rows[0];
    expect(row.file_name).toBe("lecture1.pdf");
    expect(row.chunks).toBe(42);
    expect(row.visual_chunks).toBe(5);
    expect(row.institution).toBe("MIT");
    expect(row.course).toBe("6.001");
    expect(row.status).toBe("ok");
    expect(row.error_msg).toBeNull();
  });

  it("logs an ingest with null institution/course", () => {
    logIngest(sid, "notes.pdf", 10, 0);
    const rows = getIngests(sid);
    const row = rows.find((r) => r.file_name === "notes.pdf");
    expect(row).toBeDefined();
  });

  it("logs an ingest error", () => {
    logIngestErr(sid, "broken.pdf", "parse error");
    const rows = getIngests(sid);
    const row = rows.find((r) => r.file_name === "broken.pdf");
    expect(row).toBeDefined();
    expect(row!.status).toBe("err");
    expect(row!.error_msg).toBe("parse error");
  });

  it("getIngests returns at most 20 rows", () => {
    for (let i = 0; i < 25; i++) {
      logIngest(sid, `file${i}.pdf`, i, 0, null, null);
    }
    expect(getIngests(sid).length).toBeLessThanOrEqual(20);
  });

  it("getIngests is scoped to its session", () => {
    const user2 = upsertUser("karl");
    const sid2 = uid();
    createSession(sid2, user2.id, "other-ingest");
    logIngest(sid2, "other.pdf", 1, 0);

    logIngest(sid, "mine.pdf", 2, 0);
    const rows = getIngests(sid);
    expect(rows.every((r) => r.session_id === sid)).toBe(true);
  });
});
