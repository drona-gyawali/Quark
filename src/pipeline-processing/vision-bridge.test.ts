import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "events";
import path from "path";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("../conf/logger.ts", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getLocalImages } from "./vision-bridge.ts";
import { spawn } from "child_process";
import { logger } from "../conf/logger.ts";

/**
 * Creates a fake child process with EventEmitter-based stdout/stderr/process.
 * Lets tests simulate data events and close codes without spawning anything.
 */
const makeFakeProcess = () => {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = new EventEmitter() as NodeJS.EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  proc.stdout = stdout;
  proc.stderr = stderr;
  return proc;
};

/**
 * Helper: set up spawn mock, emit stdout chunks, then close with given code.
 */
const simulateProcess = (
  stdoutChunks: string[],
  stderrChunks: string[],
  exitCode: number,
) => {
  const fakeProc = makeFakeProcess();
  vi.mocked(spawn).mockReturnValue(fakeProc as any);

  // Schedule emissions after the promise listener is set up
  setImmediate(() => {
    for (const chunk of stdoutChunks) {
      fakeProc.stdout.emit("data", Buffer.from(chunk));
    }
    for (const chunk of stderrChunks) {
      fakeProc.stderr.emit("data", Buffer.from(chunk));
    }
    fakeProc.emit("close", exitCode);
  });

  return fakeProc;
};

describe("getLocalImages", () => {
  afterEach(() => vi.clearAllMocks());

  it("resolves with parsed JSON on exit code 0", async () => {
    const payload = { 1: ["base64abc", "base64def"], 2: ["base64xyz"] };
    simulateProcess([JSON.stringify(payload)], [], 0);

    const result = await getLocalImages("/tmp/test.pdf");
    expect(result).toEqual(payload);
  });

  it("handles stdout arriving in multiple chunks", async () => {
    const payload = { 1: ["img1"] };
    const json = JSON.stringify(payload);
    // Split JSON across 3 chunks to simulate streaming
    const chunks = [json.slice(0, 5), json.slice(5, 10), json.slice(10)];
    simulateProcess(chunks, [], 0);

    const result = await getLocalImages("/tmp/test.pdf");
    expect(result).toEqual(payload);
  });

  it("resolves with empty object when python returns {}", async () => {
    simulateProcess(["{}"], [], 0);
    const result = await getLocalImages("/tmp/test.pdf");
    expect(result).toEqual({});
  });

  it("spawns python from venv/bin/python", async () => {
    simulateProcess(["{}"], [], 0);
    await getLocalImages("/tmp/test.pdf");

    const spawnCall = vi.mocked(spawn).mock.calls[0];
    expect(spawnCall[0]).toContain(path.join("venv", "bin", "python"));
  });

  it("passes vision-worker.py as the first python argument", async () => {
    simulateProcess(["{}"], [], 0);
    await getLocalImages("/tmp/test.pdf");

    const args = vi.mocked(spawn).mock.calls[0][1] as string[];
    expect(args[0]).toContain("vision-worker.py");
  });

  it("passes the resolved absolute pdf path as the second python argument", async () => {
    simulateProcess(["{}"], [], 0);
    await getLocalImages("relative/path/file.pdf");

    const args = vi.mocked(spawn).mock.calls[0][1] as string[];
    expect(path.isAbsolute(args[1])).toBe(true);
    expect(args[1]).toContain("file.pdf");
  });

  it("resolves absolute paths without double-resolving", async () => {
    simulateProcess(["{}"], [], 0);
    const absolutePath = "/absolute/path/doc.pdf";
    await getLocalImages(absolutePath);

    const args = vi.mocked(spawn).mock.calls[0][1] as string[];
    expect(args[1]).toBe(path.resolve(absolutePath));
  });

  it("rejects with exit code message when python exits non-zero", async () => {
    simulateProcess([], ["something went wrong"], 1);

    await expect(getLocalImages("/tmp/test.pdf")).rejects.toMatch(
      "Python process exited with code 1",
    );
  });

  it("rejects with correct code for exit code 2", async () => {
    simulateProcess([], [], 2);

    await expect(getLocalImages("/tmp/test.pdf")).rejects.toMatch(
      "Python process exited with code 2",
    );
  });

  it("logs stderr output when process exits with non-zero code", async () => {
    simulateProcess([], ["ModuleNotFoundError: No module named cv2"], 1);

    await getLocalImages("/tmp/test.pdf").catch(() => {});
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("ModuleNotFoundError"),
    );
  });

  it("logs stderr even when stderr arrives in multiple chunks", async () => {
    simulateProcess([], ["error part 1 ", "error part 2"], 1);

    await getLocalImages("/tmp/test.pdf").catch(() => {});
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("error part 1 error part 2"),
    );
  });

  it("rejects with 'Failed to parse Python output as JSON' on invalid JSON", async () => {
    simulateProcess(["not valid json {{"], [], 0);

    await expect(getLocalImages("/tmp/test.pdf")).rejects.toBe(
      "Failed to parse Python output as JSON",
    );
  });

  it("rejects on empty stdout (empty string is not valid JSON)", async () => {
    simulateProcess([], [], 0);

    await expect(getLocalImages("/tmp/test.pdf")).rejects.toBe(
      "Failed to parse Python output as JSON",
    );
  });

  it("logs the raw bad data when JSON parsing fails", async () => {
    const badOutput = "this is not json";
    simulateProcess([badOutput], [], 0);

    await getLocalImages("/tmp/test.pdf").catch(() => {});
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(badOutput),
    );
  });

  it("rejects on valid JS but invalid JSON (e.g. single-quoted strings)", async () => {
    simulateProcess(["{'key': 'value'}"], [], 0);

    await expect(getLocalImages("/tmp/test.pdf")).rejects.toBe(
      "Failed to parse Python output as JSON",
    );
  });

  it("does not resolve before close event fires", async () => {
    const fakeProc = makeFakeProcess();
    vi.mocked(spawn).mockReturnValue(fakeProc as any);

    let resolved = false;
    const promise = getLocalImages("/tmp/test.pdf").then(
      (r: Record<number, string[]>) => {
        resolved = true;
        return r;
      },
    );

    // Emit data but NOT close yet
    fakeProc.stdout.emit("data", Buffer.from("{}"));
    await Promise.resolve(); // flush microtasks

    expect(resolved).toBe(false);

    // Now close
    fakeProc.emit("close", 0);
    await promise;
    expect(resolved).toBe(true);
  });

  it("ignores stderr content when exit code is 0", async () => {
    // Some Python scripts write warnings to stderr but still succeed
    simulateProcess(['{"1":["img"]}'], ["UserWarning: something minor"], 0);

    const result = await getLocalImages("/tmp/test.pdf");
    expect(result).toEqual({ 1: ["img"] });
  });

  it("returns a Promise", () => {
    const fakeProc = makeFakeProcess();
    vi.mocked(spawn).mockReturnValue(fakeProc as any);
    const result = getLocalImages("/tmp/test.pdf");
    expect(result).toBeInstanceOf(Promise);
    // Prevent unhandled rejection
    result.catch(() => {});
    fakeProc.emit("close", 0);
  });
});
