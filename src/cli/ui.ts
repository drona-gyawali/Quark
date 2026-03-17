import {
  A,
  C,
  G,
  w,
  wl,
  br,
  hr,
  wrap,
  trunc,
  paint,
  cols,
  renderMD,
  nowTS,
} from "./ansi.ts";
import type { DBSession, DBIngest, DBChat } from "./db.ts";

const out = process.stdout;

const LOGO = [
  "   ██████╗ ██╗   ██╗ █████╗ ██████╗ ██╗  ██╗ ",
  "  ██╔═══██╗██║   ██║██╔══██╗██╔══██╗██║ ██╔╝ ",
  "  ██║   ██║██║   ██║███████║██████╔╝█████╔╝  ",
  "  ██║▄▄ ██║██║   ██║██╔══██║██╔══██╗██╔═██╗  ",
  "  ╚██████╔╝╚██████╔╝██║  ██║██║  ██║██║  ██╗ ",
  "   ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ",
];

export function printWelcome(knownUsers: string[]): void {
  out.write(A.reset + "\n");
  for (const l of LOGO) wl(l, C.green, true);
  br();
  wl(
    `  ${G.diamond}  Talk to your docs. No fluff, just facts.  ${G.diamond}`,
    C.amber,
  );
  br();
  wl(
    `  v1.0  ${G.dot}  Claude  ${G.dot}  VoyageAI  ${G.dot}  Qdrant  ${G.dot}  mem0`,
    C.faint,
  );
  br();
  if (knownUsers.length) {
    w("  Known users: ", C.faint);
    wl(knownUsers.join(`  ${G.dot}  `), C.dim);
  }
  br();
  hr();
}

export function printSessionHeader(
  username: string,
  label: string,
  sid: string,
  msgCount: number,
): void {
  br();
  w(`  ${G.diamond} `, C.green, true);
  w("Signed in as ", C.dim);
  w(username, C.green, true);
  w(`   ${G.v}   `, C.faint);
  w("session: ", C.faint);
  w(label, C.purple, true);
  w(`  ${G.v}  `, C.faint);
  wl(trunc(sid, 26), C.faint);
  w(`  ${G.dot}  `, C.faint);
  w(String(msgCount), C.dim);
  wl(msgCount !== 1 ? " messages in history" : " message in history", C.faint);
  br();
  hr();
  printHelp();
  hr();
}

export function printHelp(): void {
  const cmds: [string, string][] = [
    [":ingest <path>", "Embed a PDF  (quotes around paths with spaces)"],
    [':ingest "my file.pdf" MIT', "Path with spaces — wrap in quotes"],
    [":ingest <p> <inst> <c>", "Optionally add institution and course"],
    [":sessions", "List your sessions"],
    [":new [label]", "Create and switch to a new session"],
    [":switch <n>", "Switch to session number n"],
    [":history", "Show full chat history"],
    [":docs", "List ingested documents"],
    [":clear", "Clear chat history"],
    [":help", "Show this reference"],
    [":q / :quit", "Exit"],
    ["<anything else>", "Query your knowledge base"],
  ];
  br();
  wl("  Commands", C.amber, true);
  br();
  for (const [cmd, desc] of cmds) {
    w("    " + cmd.padEnd(22), C.blue);
    wl("  " + desc, C.dim);
  }
  br();
}

const BADGE = 15;
const TS = 10;

export function printUserMsg(username: string, text: string, ts: string): void {
  br();
  const badge = trunc(`${G.bullet} ${username}`, BADGE).padEnd(BADGE);
  const msgW = Math.max(16, cols() - BADGE - TS - 2);
  const lines = wrap(text, msgW);
  const indent = " ".repeat(BADGE + TS);
  for (let i = 0; i < lines.length; i++) {
    if (i === 0) {
      w(badge, C.blue, true);
      w((ts + "  ").slice(0, TS), C.faint);
    } else out.write(indent);
    wl(lines[i]!, C.text);
  }
}

export function printBotMsg(text: string, ts: string): void {
  br();
  // Badge + timestamp header
  const badge = `${G.diamond}  Quark`.padEnd(BADGE);
  w(badge, C.green, true);
  w((ts + "  ").slice(0, TS), C.faint);
  br();
  // Markdown body — indented to align under badge
  out.write(renderMD(text, BADGE + TS));
  out.write("\n\n");
}

export function printErrMsg(text: string): void {
  br();
  w(`  ${G.cross}  `, C.red, true);
  wl(text, C.red);
  br();
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function startSpinner(label = "Thinking"): () => void {
  let i = 0;
  // Draw initial frame
  out.write(
    "\n" +
      paint("  ", C.faint) +
      paint(SPINNER_FRAMES[0]!, C.green, true) +
      paint("  " + label + "…", C.green) +
      paint("  please wait", C.faint),
  );
  const iv = setInterval(() => {
    i = (i + 1) % SPINNER_FRAMES.length;
    out.write(
      "\r" +
        paint("  ", C.faint) +
        paint(SPINNER_FRAMES[i]!, C.green, true) +
        paint("  " + label + "…", C.green) +
        paint("  please wait", C.faint),
    );
  }, 80);
  // Return stop function — clears the spinner line
  return () => {
    clearInterval(iv);
    out.write(A.clearLine);
  };
}

export function boxPrompt(label: string): string {
  out.write(
    "\n" + paint("  " + G.h.repeat(Math.max(1, cols() - 4)), C.border) + "\n",
  );
  return (
    paint(`  ${G.diamond} `, C.green, true) +
    paint(label, C.green, true) +
    paint(` ${G.bullet} `, C.amber) +
    A.reset
  );
}

export function printSessions(sessions: DBSession[], activeId: string): void {
  br();
  wl("  Sessions", C.amber, true);
  br();
  sessions.forEach((s, i) => {
    const active = s.session_id === activeId;
    w(active ? `  ${G.bullet} ` : "    ", C.green);
    w(`[${i + 1}]  `, C.faint);
    w(s.label.padEnd(18), active ? C.green : C.text, active);
    w("  " + trunc(s.session_id, 24), C.faint);
    wl("  " + s.last_active.slice(0, 16), C.faint);
  });
  br();
  wl(`  ${G.dot}  :switch <n>  ${G.dot}  :new [label]`, C.faint);
  br();
}

export function printDocs(ingests: DBIngest[]): void {
  br();
  wl("  Ingested Documents", C.amber, true);
  br();
  if (!ingests.length) {
    wl(`  ${G.dot}  No documents yet.`, C.faint);
    br();
    return;
  }
  for (const r of ingests) {
    const ok = r.status === "ok";
    w(ok ? `  ${G.check}  ` : `  ${G.cross}  `, ok ? C.green : C.red, true);
    w(trunc(r.file_name, 38), C.text);
    if (ok) {
      w("  " + r.chunks + " chunks", C.faint);
      if (r.visual_chunks > 0) w("  " + r.visual_chunks + " visual", C.faint);
    } else w("  " + trunc(r.error_msg ?? "error", 32), C.red);
    wl("  " + r.ingested_at.slice(0, 16), C.faint);
  }
  br();
}

export function printHistory(chats: DBChat[], username: string): void {
  br();
  wl(
    `  Chat History  ${G.dot}  ${chats.length} message${chats.length !== 1 ? "s" : ""}`,
    C.amber,
    true,
  );
  hr();
  if (!chats.length) {
    wl(`  ${G.dot}  No messages yet.`, C.faint);
    br();
    return;
  }
  for (const c of chats) {
    const ts = c.created_at.slice(11, 16);
    if (c.role === "user") printUserMsg(username, c.content, ts);
    else if (c.role === "assistant") printBotMsg(c.content, ts);
    else {
      w(`  ${G.warn}  `, C.amber, true);
      wl(c.content, C.amber);
    }
  }
  hr();
}

export function printIngestStart(
  fileName: string,
  inst: string,
  course: string,
): void {
  br();
  wl(`  ${G.ring}  Ingesting: ${fileName}`, C.green, true);
  w("     Institution:  ", C.faint);
  wl(inst, C.blue);
  if (course) {
    w("     Course:       ", C.faint);
    wl(course, C.blue);
  }
  out.write(paint("     Processing — this may take a few minutes…", C.faint));
}
export function printIngestDone(
  fileName: string,
  chunks: number,
  visual: number,
): void {
  out.write(A.clearLine);
  w(`  ${G.check}  `, C.green, true);
  w(trunc(fileName, 40) + "  ", C.text);
  w(chunks + " chunks", C.green);
  if (visual > 0) w("  " + visual + " visual", C.dim);
  br();
  br();
}
export function printIngestError(fileName: string, err: string): void {
  out.write(A.clearLine);
  w(`  ${G.cross}  `, C.red, true);
  w(trunc(fileName, 40) + "  ", C.text);
  wl(trunc(err, 60), C.red);
  br();
}
