import { describe, it, expect, vi, beforeEach } from "vitest";
import { getLocalImages } from "./vision-bridge";
import { logger } from "../conf/logger";

// --------------------
// MOCK LOGGER (FIX for your crash)
// --------------------
vi.mock("../conf/logger", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// --------------------
// MOCK child_process
// --------------------
const mockStdout = {
  on: vi.fn(),
};

const mockStderr = {
  on: vi.fn(),
};

const mockStdin = {
  write: vi.fn(),
  end: vi.fn(),
};

const mockProcess = {
  stdin: mockStdin,
  stdout: mockStdout,
  stderr: mockStderr,
  on: vi.fn(),
};

vi.mock("child_process", () => ({
  spawn: vi.fn(() => mockProcess),
}));

// helper to trigger spawn callbacks
function triggerClose(code: number) {
  const closeHandler = mockProcess.on.mock.calls.find(
    (c) => c[0] === "close",
  )?.[1];

  closeHandler?.(code);
}

function triggerStdout(data: string) {
  const stdoutHandler = mockStdout.on.mock.calls.find(
    (c) => c[0] === "data",
  )?.[1];

  stdoutHandler?.(Buffer.from(data));
}

function triggerStderr(data: string) {
  const stderrHandler = mockStderr.on.mock.calls.find(
    (c) => c[0] === "data",
  )?.[1];

  stderrHandler?.(Buffer.from(data));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getLocalImages", () => {
  it("resolves with parsed JSON on exit code 0", async () => {
    const fakeOutput = JSON.stringify({
      doc_id: "123",
      images: [{ page: 1, s3_key: "img.png" }],
    });

    setTimeout(() => {
      triggerStdout(fakeOutput);
      triggerClose(0);
    }, 0);

    const result = await getLocalImages(Buffer.from("pdf"));

    expect(result.doc_id).toBe("123");
    expect(result.images.length).toBe(1);
  });

  it("handles stdout arriving in multiple chunks", async () => {
    setTimeout(() => {
      triggerStdout('{"doc_id":');
      triggerStdout('"abc","images":[]}');
      triggerClose(0);
    }, 0);

    const result = await getLocalImages(Buffer.from("pdf"));

    expect(result.doc_id).toBe("abc");
  });

  it("rejects on non-zero exit code", async () => {
    setTimeout(() => {
      triggerStderr("something went wrong");
      triggerClose(1);
    }, 0);

    await expect(getLocalImages(Buffer.from("pdf"))).rejects.toThrow(
      "Python process exited with code 1",
    );

    expect(logger.error).toHaveBeenCalled();
  });

  it("rejects on JSON parse error", async () => {
    setTimeout(() => {
      triggerStdout("not-valid-json");
      triggerClose(0);
    }, 0);

    await expect(getLocalImages(Buffer.from("pdf"))).rejects.toThrow(
      "Failed to parse Python output as JSON",
    );

    expect(logger.error).toHaveBeenCalled();
  });

  it("logs stderr when process fails", async () => {
    setTimeout(() => {
      triggerStderr("ModuleNotFoundError: missing module");
      triggerClose(1);
    }, 0);

    await getLocalImages(Buffer.from("pdf")).catch(() => {});

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("ModuleNotFoundError"),
    );
  });

  it("ignores stderr when exit code is 0", async () => {
    setTimeout(() => {
      triggerStderr("warning only");
      triggerStdout('{"doc_id":"ok","images":[]}');
      triggerClose(0);
    }, 0);

    const result = await getLocalImages(Buffer.from("pdf"));

    expect(result.doc_id).toBe("ok");
  });
});
