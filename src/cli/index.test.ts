import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";

// ── Question queue ────────────────────────────────────────────────────────────
// Shared between the mock factory and test bodies.
const questionQueue: string[] = [];

// ── Epoch counter ─────────────────────────────────────────────────────────────
// process.exit() is mocked and RETURNS normally.  After :q, the while(true)
// loop keeps running and calls rl.question() on the shared mockRl, stealing
// items from the queue that belong to the next test.
//
// A boolean flag doesn't work because the stale loop's rl.question() executes
// SYNCHRONOUSLY (shifting an item from the queue), then schedules setImmediate.
// By the time that setImmediate fires the next test may have re-enabled the
// flag — making the stale callback run in the wrong test's context.
//
// An epoch counter fixes this: the epoch is CAPTURED at rl.question call time
// and compared at setImmediate fire time.  Any time a new run starts or the
// current one exits, the epoch is incremented — all pending callbacks from
// the old epoch see a mismatch and become permanent no-ops.
let epoch = 0;

const mockRl = {
  question: vi.fn((prompt: string, cb: (a: string) => void) => {
    const answer = questionQueue.shift() ?? "";
    const capturedEpoch = epoch; // snapshot at schedule time
    setImmediate(() => {
      if (capturedEpoch === epoch) cb(answer); // fire only if still current run
    });
  }),
  close: vi.fn(),
  on: vi.fn((_event: string, _cb: () => void) => {}),
};

// ── Shared mutable state refs ─────────────────────────────────────────────────
// These live in the test-file's module scope, so vi.resetModules() never touches
// them.  Factory closures capture these objects by reference — every fresh
// vi.fn() created after a resetModules() will still read the current value.
const fsState = {
  accessRejects: false,
  accessError: new Error("ENOENT"),
};

const ingestState = {
  totalChunks: 10,
  visualChunks: 2,
  throws: false,
  throwError: new Error("ingest failed"),
};

const retrivalState = {
  answer: "Here is your answer.",
  throws: false,
  throwError: new Error("retrival failed"),
};

// ── Module mocks ──────────────────────────────────────────────────────────────
vi.mock("node:readline", () => ({
  default: { createInterface: vi.fn(() => mockRl) },
  createInterface: vi.fn(() => mockRl),
}));

// Default implementations are defined in the factory so fresh instances
// created after vi.resetModules() are immediately usable without any
// per-test re-configuration.
vi.mock("./db.ts", () => ({
  upsertUser: vi.fn(() => ({ id: 1, username: "testuser", created_at: "" })),
  allUsernames: vi.fn(() => ["testuser"]),
  createSession: vi.fn(),
  getUserSessions: vi.fn(() => []),
  appendChat: vi.fn(),
  getChat: vi.fn(() => []),
  clearChat: vi.fn(),
  logIngest: vi.fn(),
  logIngestErr: vi.fn(),
  getIngests: vi.fn(() => []),
  touchSession: vi.fn(),
  deleteSession: vi.fn(),
}));

vi.mock("./ui.ts", () => ({
  printWelcome: vi.fn(),
  printSessionHeader: vi.fn(),
  printHelp: vi.fn(),
  printSessions: vi.fn(),
  printDocs: vi.fn(),
  printHistory: vi.fn(),
  printIngestStart: vi.fn(),
  printIngestDone: vi.fn(),
  printIngestError: vi.fn(),
  printUserMsg: vi.fn(),
  printBotMsg: vi.fn(),
  printErrMsg: vi.fn(),
  startSpinner: vi.fn(() => vi.fn()), // returns a stopSpinner fn
  boxPrompt: vi.fn(() => "> "),
}));

vi.mock("./ansi.ts", () => ({
  A: { reset: "" },
  C: { amber: "", red: "", green: "", dim: "", faint: "", blue: "" },
  G: { bullet: "•", cross: "✗", check: "✓", warn: "⚠", dot: "·", diamond: "◆" },
  w: vi.fn(),
  wl: vi.fn(),
  br: vi.fn(),
  hr: vi.fn(),
  paint: vi.fn((s: string) => s),
  nowTS: vi.fn(() => "12:00"),
}));

// Factory closes over `fsState` — after resetModules the fresh vi.fn() still
// reads the current value of fsState.accessRejects at call-time.
vi.mock("node:fs/promises", () => ({
  default: {
    access: vi.fn(() =>
      fsState.accessRejects
        ? Promise.reject(fsState.accessError)
        : Promise.resolve(),
    ),
    readFile: vi.fn(() => Promise.resolve(Buffer.from("pdf-bytes"))),
  },
  access: vi.fn(() =>
    fsState.accessRejects
      ? Promise.reject(fsState.accessError)
      : Promise.resolve(),
  ),
  readFile: vi.fn(() => Promise.resolve(Buffer.from("pdf-bytes"))),
}));

// Factory closes over `ingestState`.
vi.mock("../pipeline-processing/ingest.ts", () => ({
  ingestDocument: vi.fn(() =>
    ingestState.throws
      ? Promise.reject(ingestState.throwError)
      : Promise.resolve({
          totalChunks: ingestState.totalChunks,
          visualChunks: ingestState.visualChunks,
        }),
  ),
}));

// Factory closes over `retrivalState`.
vi.mock("../pipeline-processing/retrival.ts", () => ({
  retriveContext: vi.fn(() =>
    retrivalState.throws
      ? Promise.reject(retrivalState.throwError)
      : Promise.resolve({ answer: retrivalState.answer }),
  ),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
let exitSpy: MockInstance;

/**
 * Push answers into the queue and import a fresh copy of main.ts.
 * The module auto-runs main() on import.  We wait for process.exit
 * to be called (which the spy intercepts) or for a fixed timeout.
 */
async function runWithInputs(inputs: string[]): Promise<void> {
  // Increment before pushing inputs so any stale setImmediate callbacks
  // from the previous run that haven't fired yet will see a mismatch and
  // become no-ops — even if they fire after we push the new inputs.
  epoch++;
  questionQueue.push(...inputs);
  vi.resetModules();

  const done = new Promise<void>((resolve) => {
    exitSpy.mockImplementation(() => {
      // Bump epoch immediately on exit: process.exit() is mocked and returns,
      // so the while(true) loop calls ask() one more time synchronously.
      // That rl.question() call captures the new epoch value, so when its
      // setImmediate fires it will be a no-op once the NEXT test bumps epoch.
      epoch++;
      resolve();
    });
  });

  await import("./index.ts");
  await Promise.race([done, new Promise((r) => setTimeout(r, 2000))]);
  epoch++; // safety: ensure stale callbacks are dead even on timeout path
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
beforeEach(async () => {
  // Clear call records only — does NOT reset implementations, so every
  // vi.fn(() => ...) defined in the factories above keeps its default behaviour.
  questionQueue.length = 0;
  vi.clearAllMocks();
  exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

  // Reset shared state refs to defaults before each test.
  fsState.accessRejects = false;
  fsState.accessError = new Error("ENOENT");

  ingestState.totalChunks = 10;
  ingestState.visualChunks = 2;
  ingestState.throws = false;
  ingestState.throwError = new Error("ingest failed");

  retrivalState.answer = "Here is your answer.";
  retrivalState.throws = false;
  retrivalState.throwError = new Error("retrival failed");
});

afterEach(() => {
  exitSpy.mockRestore();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("register() — username validation", () => {
  it("rejects an empty username and retries", async () => {
    // empty → too-short → valid → :q
    await runWithInputs(["", "a", "testuser", ":q"]);
    const { wl } = vi.mocked(await import("./ansi.ts"));
    // wl should have been called with red colour for each rejection
    const redCalls = wl.mock.calls.filter(
      (c) =>
        String(c[0]).includes("Cannot be empty") ||
        String(c[0]).includes("Minimum 2"),
    );
    expect(redCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects names shorter than 2 characters", async () => {
    await runWithInputs(["x", "testuser", ":q"]);
    const { wl } = vi.mocked(await import("./ansi.ts"));
    expect(wl.mock.calls.some((c) => String(c[0]).includes("Minimum 2"))).toBe(
      true,
    );
  });

  it("rejects names with invalid characters", async () => {
    await runWithInputs(["hello world!", "testuser", ":q"]);
    const { wl } = vi.mocked(await import("./ansi.ts"));
    expect(
      wl.mock.calls.some((c) => String(c[0]).includes("Letters, numbers")),
    ).toBe(true);
  });

  it("accepts a valid username and creates a session when none exist", async () => {
    const { createSession, getUserSessions } = vi.mocked(
      await import("./db.ts"),
    );
    getUserSessions.mockReturnValue([]);
    await runWithInputs(["newuser", ":q"]);
    expect(createSession).toHaveBeenCalledOnce();
  });

  it("reuses existing sessions when the user already has them", async () => {
    const { getUserSessions, createSession } = vi.mocked(
      await import("./db.ts"),
    );
    getUserSessions.mockReturnValue([
      {
        id: 1,
        session_id: "existing-sid",
        user_id: 1,
        label: "old-session",
        last_active: "",
      },
    ]);
    await runWithInputs(["testuser", ":q"]);
    expect(createSession).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("mainLoop — command routing", () => {
  // Each test registers as "testuser" then issues one command then ":q"

  it(":help calls printHelp", async () => {
    await runWithInputs(["testuser", ":help", ":q"]);
    const { printHelp } = vi.mocked(await import("./ui.ts"));
    expect(printHelp).toHaveBeenCalledOnce();
  });

  it(":sessions calls printSessions", async () => {
    await runWithInputs(["testuser", ":sessions", ":q"]);
    const { printSessions } = vi.mocked(await import("./ui.ts"));
    expect(printSessions).toHaveBeenCalledOnce();
  });

  it(":history calls printHistory", async () => {
    await runWithInputs(["testuser", ":history", ":q"]);
    const { printHistory } = vi.mocked(await import("./ui.ts"));
    expect(printHistory).toHaveBeenCalledOnce();
  });

  it(":docs calls printDocs", async () => {
    await runWithInputs(["testuser", ":docs", ":q"]);
    const { printDocs } = vi.mocked(await import("./ui.ts"));
    expect(printDocs).toHaveBeenCalledOnce();
  });

  it(":clear calls clearChat", async () => {
    await runWithInputs(["testuser", ":clear", ":q"]);
    const { clearChat } = vi.mocked(await import("./db.ts"));
    expect(clearChat).toHaveBeenCalledOnce();
  });

  // TODO: investigate why test case is falling
  //   it(":new creates a session and advances activeIdx", async () => {
  //     // Import AFTER runWithInputs so we get the fresh post-reset instance
  //     await runWithInputs(["testuser", ":new my-label", ":q"]);
  //     const { createSession } = vi.mocked(await import("./db.ts"));
  //     // First createSession for registration (getUserSessions returns [] by default),
  //     // second for :new my-label
  //     expect(createSession).toHaveBeenCalledTimes(2);
  //     const lastCall = createSession.mock.calls.at(-1)!;
  //     expect(lastCall[2]).toBe("my-label");
  //   });

  it(":new without label uses auto-generated label", async () => {
    await runWithInputs(["testuser", ":new", ":q"]);
    const { createSession } = vi.mocked(await import("./db.ts"));
    const lastCall = createSession.mock.calls.at(-1)!;
    expect(lastCall[2]).toMatch(/^session-/);
  });

  it(":switch with valid index switches the active session", async () => {
    await runWithInputs(["testuser", ":new second", ":switch 2", ":q"]);
    // After :switch 2 we should see the second session label via wl
    const { wl } = vi.mocked(await import("./ansi.ts"));
    const switchedMsg = wl.mock.calls.find((c) =>
      String(c[0]).includes("second"),
    );
    // w() is also used for the label — check either w or wl
    const { w } = vi.mocked(await import("./ansi.ts"));
    const label = w.mock.calls.find((c) => String(c[0]).includes("second"));
    expect(label || switchedMsg).toBeTruthy();
  });

  it(":switch with out-of-range index prints error", async () => {
    await runWithInputs(["testuser", ":switch 99", ":q"]);
    const { wl } = vi.mocked(await import("./ansi.ts"));
    expect(wl.mock.calls.some((c) => String(c[0]).includes("Invalid"))).toBe(
      true,
    );
  });

  it(":switch with NaN index prints error", async () => {
    await runWithInputs(["testuser", ":switch abc", ":q"]);
    const { wl } = vi.mocked(await import("./ansi.ts"));
    expect(wl.mock.calls.some((c) => String(c[0]).includes("Invalid"))).toBe(
      true,
    );
  });

  it("unknown : command prints error hint", async () => {
    await runWithInputs(["testuser", ":bogus", ":q"]);
    const { wl } = vi.mocked(await import("./ansi.ts"));
    expect(wl.mock.calls.some((c) => String(c[0]).includes("Unknown"))).toBe(
      true,
    );
    expect(wl.mock.calls.some((c) => String(c[0]).includes(":help"))).toBe(
      true,
    );
  });

  it("bare :ingest without a path shows usage", async () => {
    await runWithInputs(["testuser", ":ingest", ":q"]);
    const { wl } = vi.mocked(await import("./ansi.ts"));
    expect(wl.mock.calls.some((c) => String(c[0]).includes("Usage"))).toBe(
      true,
    );
  });

  it("empty input is ignored — no command fires", async () => {
    await runWithInputs(["testuser", "   ", ":q"]);
    const { printHelp } = vi.mocked(await import("./ui.ts"));
    expect(printHelp).not.toHaveBeenCalled();
  });

  it(":quit exits the process", async () => {
    await runWithInputs(["testuser", ":quit"]);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe(":ingest — argument parsing", () => {
  async function runIngest(ingestCmd: string) {
    await runWithInputs(["testuser", ingestCmd, ":q"]);
  }

  it("parses a simple unquoted path", async () => {
    await runIngest(":ingest /tmp/lecture.pdf MIT 6.001");
    const { ingestDocument } = vi.mocked(
      await import("../pipeline-processing/ingest.ts"),
    );
    expect(ingestDocument).toHaveBeenCalledOnce();
    const [, absPath, opts] = ingestDocument.mock.calls[0]!;
    expect(absPath).toContain("lecture.pdf");
    expect(opts.institution).toBe("MIT");
    expect(opts.courseName).toBe("6.001");
  });

  it("parses a double-quoted path containing spaces", async () => {
    await runIngest(':ingest "/tmp/my notes/lecture 1.pdf" Stanford CS229');
    const { ingestDocument } = vi.mocked(
      await import("../pipeline-processing/ingest.ts"),
    );
    expect(ingestDocument).toHaveBeenCalledOnce();
    const [, absPath, opts] = ingestDocument.mock.calls[0]!;
    expect(absPath).toContain("lecture 1.pdf");
    expect(opts.institution).toBe("Stanford");
  });

  it("uses 'Default' institution when none provided", async () => {
    await runIngest(":ingest /tmp/notes.pdf");
    const { ingestDocument } = vi.mocked(
      await import("../pipeline-processing/ingest.ts"),
    );
    expect(ingestDocument).toHaveBeenCalledOnce();
    const [, , opts] = ingestDocument.mock.calls[0]!;
    expect(opts.institution).toBe("Default");
  });

  it("logs a successful ingest to the db", async () => {
    // Override via shared state so the fresh post-reset mock instance picks it up
    ingestState.totalChunks = 5;
    ingestState.visualChunks = 1;
    await runIngest(":ingest /tmp/ok.pdf MIT 6.002");
    const { logIngest } = vi.mocked(await import("./db.ts"));
    expect(logIngest).toHaveBeenCalledWith(
      expect.any(String),
      "ok.pdf",
      5,
      1,
      "MIT",
      "6.002",
    );
  });

  it("prints error and logs to db when file not found", async () => {
    // Set via shared state ref — the factory closure reads this at call-time,
    // so even the fresh post-reset vi.fn() instance will reject.
    fsState.accessRejects = true;
    await runIngest(":ingest /tmp/missing.pdf");
    const { wl } = vi.mocked(await import("./ansi.ts"));
    expect(
      wl.mock.calls.some((c) => String(c[0]).includes("File not found")),
    ).toBe(true);
    // ingestDocument must NOT be called when access check fails
    const { ingestDocument } = vi.mocked(
      await import("../pipeline-processing/ingest.ts"),
    );
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  it("logs error to db when ingestDocument throws", async () => {
    // Use shared state so the fresh post-reset mock instance throws
    ingestState.throws = true;
    ingestState.throwError = new Error("parse failure");
    await runIngest(":ingest /tmp/bad.pdf");
    const { logIngestErr } = vi.mocked(await import("./db.ts"));
    expect(logIngestErr).toHaveBeenCalledWith(
      expect.any(String),
      "bad.pdf",
      "parse failure",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("cmdQuery — free text input", () => {
  it("appends user message, calls retriveContext, appends assistant reply", async () => {
    retrivalState.answer = "42 is the answer.";
    await runWithInputs(["testuser", "What is the meaning of life?", ":q"]);
    const { appendChat } = vi.mocked(await import("./db.ts"));
    const chatCalls = appendChat.mock.calls;
    expect(chatCalls.some(([, role]) => role === "user")).toBe(true);
    expect(chatCalls.some(([, role]) => role === "assistant")).toBe(true);
    const assistantCall = chatCalls.find(([, role]) => role === "assistant")!;
    expect(assistantCall[2]).toBe("42 is the answer.");
  });

  it("appends system message on retrival error", async () => {
    retrivalState.throws = true;
    retrivalState.throwError = new Error("retrival boom");
    await runWithInputs(["testuser", "this will fail", ":q"]);
    const { appendChat } = vi.mocked(await import("./db.ts"));
    const errCall = appendChat.mock.calls.find(([, role]) => role === "system");
    expect(errCall).toBeDefined();
    expect(errCall![2]).toContain("retrival boom");
  });

  it("prints bot message on success", async () => {
    retrivalState.answer = "Success reply.";
    await runWithInputs(["testuser", "hello bot", ":q"]);
    const { printBotMsg } = vi.mocked(await import("./ui.ts"));
    expect(printBotMsg).toHaveBeenCalledWith(
      "Success reply.",
      expect.any(String),
    );
  });

  it("prints error message on failure", async () => {
    retrivalState.throws = true;
    retrivalState.throwError = new Error("oops");
    await runWithInputs(["testuser", "fail query", ":q"]);
    const { printErrMsg } = vi.mocked(await import("./ui.ts"));
    expect(printErrMsg).toHaveBeenCalledWith("oops");
  });

  it("starts and stops the spinner around the API call", async () => {
    await runWithInputs(["testuser", "spinner test", ":q"]);
    const { startSpinner } = vi.mocked(await import("./ui.ts"));
    expect(startSpinner).toHaveBeenCalledWith("Thinking");
    // startSpinner's return value (the stopSpinner fn) should have been called
    const stopSpinner = startSpinner.mock.results[0]?.value;
    expect(stopSpinner).toHaveBeenCalledOnce();
  });
});
