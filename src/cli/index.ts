import readline from "node:readline";
import path from "node:path";
import fs from "node:fs/promises";
import * as z from "zod";

import {
  upsertUser,
  allUsernames,
  createSession,
  getUserSessions,
  appendChat,
  getChat,
  clearChat,
  logIngest,
  logIngestErr,
  getIngests,
} from "./db.ts";
import {
  printWelcome,
  printSessionHeader,
  printHelp,
  printSessions,
  printDocs,
  printHistory,
  printIngestStart,
  printIngestDone,
  printIngestError,
  printUserMsg,
  printBotMsg,
  printErrMsg,
  startSpinner,
  boxPrompt,
} from "./ui.ts";
import { A, C, G, w, wl, br, hr, paint, nowTS } from "./ansi.ts";

if (!(globalThis as any)._zod) (globalThis as any)._zod = z;

interface Sess {
  id: string;
  label: string;
}
let user: { id: number; username: string } | null = null;
let sessions: Sess[] = [];
let activeIdx = 0;
let institution = "Default";

const active = (): Sess | null => sessions[activeIdx] ?? null;
const genSid = (u: string) =>
  `${u.toLowerCase().replace(/\W+/g, "_")}_${Date.now().toString(36)}`;

let rl: readline.Interface;
function initRL() {
  if (rl) {
    try {
      rl.close();
    } catch {}
  }
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 200,
  });
}
const ask = (p: string): Promise<string> =>
  new Promise((resolve) => rl.question(p, resolve));

async function register(): Promise<void> {
  printWelcome(allUsernames());
  initRL();
  while (true) {
    const name = (
      await ask(paint(`  ${G.bullet}  Username: `, C.amber, true))
    ).trim();
    if (!name) {
      wl(`  ${G.cross}  Cannot be empty.`, C.red);
      continue;
    }
    if (name.length < 2) {
      wl(`  ${G.cross}  Minimum 2 characters.`, C.red);
      continue;
    }
    if (!/^[\w\-]+$/.test(name)) {
      wl(`  ${G.cross}  Letters, numbers, _ and - only.`, C.red);
      continue;
    }

    const dbUser = upsertUser(name);
    user = dbUser;
    const dbSess = getUserSessions(dbUser.id);
    if (dbSess.length > 0) {
      sessions = dbSess.map((s) => ({ id: s.session_id, label: s.label }));
    } else {
      const sid = genSid(name);
      createSession(sid, dbUser.id, "session-1");
      sessions = [{ id: sid, label: "session-1" }];
    }
    activeIdx = 0;
    br();
    printSessionHeader(
      name,
      sessions[0]!.label,
      sessions[0]!.id,
      getChat(sessions[0]!.id).length,
    );
    break;
  }
}

async function cmdIngest(args: string): Promise<void> {
  const { ingestDocument } = await import("../pipeline-processing/ingest.ts");

  // Parse args — support quoted paths with spaces:
  //   :ingest "/path/with spaces/file.pdf" institution course
  //   :ingest /simple/path.pdf institution course
  let filePath: string;
  let rest: string;
  const trimmed = args.trim();
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const quote = trimmed[0]!;
    const close = trimmed.indexOf(quote, 1);
    if (close === -1) {
      // unclosed quote — treat whole thing as path
      filePath = trimmed.replace(/['"]/g, "").trim();
      rest = "";
    } else {
      filePath = trimmed.slice(1, close);
      rest = trimmed.slice(close + 1).trim();
    }
  } else {
    // no quotes — first whitespace-delimited token is the path
    const spaceIdx = trimmed.search(/\s/);
    if (spaceIdx === -1) {
      filePath = trimmed;
      rest = "";
    } else {
      filePath = trimmed.slice(0, spaceIdx);
      rest = trimmed.slice(spaceIdx + 1).trim();
    }
  }
  const restParts = rest.split(/\s+/).filter(Boolean);
  const inst = restParts[0] ?? institution;
  const course = restParts.slice(1).join(" ");
  const sess = active();
  if (!filePath) {
    wl(`  ${G.warn}  Usage: :ingest <path> [institution] [course]`, C.amber);
    return;
  }
  if (!sess) {
    wl(`  ${G.cross}  No active session.`, C.red);
    return;
  }
  const absPath = path.resolve(filePath);
  const fileName = path.basename(absPath);
  try {
    await fs.access(absPath);
  } catch {
    wl(`  ${G.cross}  File not found: ${absPath}`, C.red);
    return;
  }
  printIngestStart(fileName, inst, course);
  try {
    const buf = Buffer.from(await fs.readFile(absPath));
    const res = await ingestDocument(buf, absPath, {
      mode: 0,
      institution: inst,
      courseName: course || undefined,
    } as any);
    logIngest(
      sess.id,
      fileName,
      res.totalChunks,
      res.visualChunks,
      inst,
      course,
    );
    institution = inst;
    printIngestDone(fileName, res.totalChunks, res.visualChunks);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    logIngestErr(sess.id, fileName, msg);
    printIngestError(fileName, msg);
  }
}

function cmdSessions() {
  if (user) printSessions(getUserSessions(user.id), active()?.id ?? "");
}

function cmdNew(lbl?: string) {
  if (!user) return;
  const label = lbl?.trim() || `session-${sessions.length + 1}`;
  const sid = genSid(user.username);
  createSession(sid, user.id, label);
  sessions.push({ id: sid, label });
  activeIdx = sessions.length - 1;
  br();
  w(`  ${G.check}  `, C.green, true);
  w("Created ", C.dim);
  w(label, C.green, true);
  w(`  ${G.dot}  0 messages`, C.faint);
  br();
  hr();
}

function cmdSwitch(arg: string) {
  const n = parseInt(arg, 10);
  if (isNaN(n) || n < 1 || n > sessions.length) {
    wl(`  ${G.cross}  Invalid. Use :sessions to list.`, C.red);
    return;
  }
  activeIdx = n - 1;
  const cnt = getChat(sessions[activeIdx]!.id).length;
  br();
  w(`  ${G.check}  `, C.green, true);
  w("Switched to ", C.dim);
  w(sessions[activeIdx]!.label, C.green, true);
  w(`  ${G.dot}  `, C.faint);
  wl(cnt + (cnt !== 1 ? " messages" : " message"), C.dim);
  hr();
}

function cmdHistory() {
  const s = active();
  if (s) printHistory(getChat(s.id), user?.username ?? "you");
}
function cmdDocs() {
  const s = active();
  if (s) printDocs(getIngests(s.id));
}
function cmdClear() {
  const s = active();
  if (!s) return;
  clearChat(s.id);
  br();
  wl(`  ${G.check}  Chat cleared.`, C.green);
  br();
}

async function cmdQuery(text: string): Promise<void> {
  const { retriveContext } = await import("../pipeline-processing/retrival.ts");
  const sess = active();
  const username = user?.username ?? "user";
  if (!sess) {
    wl(`  ${G.cross}  No active session.`, C.red);
    return;
  }
  const sid = sess.id;

  printUserMsg(username, text, nowTS());
  appendChat(sid, "user", text);
  const stopSpinner = startSpinner("Thinking");

  let answer = "";
  let isError = false;
  try {
    const res = await retriveContext(
      {
        message: text,
        filters: { institution, mode: 0 as any },
        userId: username,
        sessionId: sid,
      } as any,
      { message: text, userId: username, sessionId: sid } as any,
      {
        message: text,
        userId: username,
        sessionId: sid,
        query: text,
        response: "",
      } as any,
    );
    answer = res.answer;
  } catch (e: any) {
    answer = e?.message ?? String(e);
    isError = true;
  } finally {
    stopSpinner();
    if (isError) {
      printErrMsg(answer);
      appendChat(sid, "system", answer);
    } else {
      appendChat(sid, "assistant", answer);
      printBotMsg(answer, nowTS());
    }
  }
  // Let fire-and-forget pipeline tasks flush their log writes before next prompt
  await new Promise((r) => setTimeout(r, 300));
}

async function mainLoop(): Promise<void> {
  initRL();
  rl.on("SIGINT", () => {
    br();
    br();
    wl(`  ${G.diamond}  Goodbye.`, C.green, true);
    br();
    process.exit(0);
  });

  while (true) {
    const line = (await ask(boxPrompt(active()?.label ?? "─"))).trim();
    if (!line) continue;

    if (line === ":q" || line === ":quit") {
      br();
      wl(`  ${G.diamond}  Goodbye.`, C.green, true);
      br();
      rl.close();
      process.exit(0);
    }
    if (line === ":help") {
      hr();
      printHelp();
      hr();
      continue;
    }
    if (line === ":sessions") {
      cmdSessions();
      continue;
    }
    if (line.startsWith(":new")) {
      cmdNew(line.slice(4).trim() || undefined);
      continue;
    }
    if (line.startsWith(":switch ")) {
      cmdSwitch(line.slice(8).trim());
      continue;
    }
    if (line.startsWith(":ingest ")) {
      await cmdIngest(line.slice(8));
      continue;
    }
    if (line === ":ingest") {
      wl(`  ${G.warn}  Usage: :ingest <path>`, C.amber);
      continue;
    }
    if (line === ":history") {
      cmdHistory();
      continue;
    }
    if (line === ":docs") {
      cmdDocs();
      continue;
    }
    if (line === ":clear") {
      cmdClear();
      continue;
    }
    if (line.startsWith(":")) {
      wl(`  ${G.cross}  Unknown: ${line}`, C.red);
      wl(`  ${G.dot}  Type :help`, C.faint);
      continue;
    }
    await cmdQuery(line);
  }
}

async function main(): Promise<void> {
  process.stdout.write(A.reset);
  try {
    await register();
    await mainLoop();
  } catch (e: any) {
    br();
    wl("Fatal: " + (e?.message ?? String(e)), C.red);
    process.exit(1);
  }
}

main();
