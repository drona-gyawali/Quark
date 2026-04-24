import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./utils.ts", () => ({
  partitionDocument: vi.fn(),
  describeVisualElements: vi.fn(),
  processMetadata: vi.fn(),
  visionMaker: vi.fn(),
}));

vi.mock("./vision-bridge.ts", () => ({
  getLocalImages: vi.fn(),
}));

vi.mock("./exec.ts", () => ({
  PipelineException: class PipelineException extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "PipelineException";
    }
  },
}));

vi.mock("../conf/logger.ts", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { ingestDocument } from "./ingest.ts";
import {
  partitionDocument,
  describeVisualElements,
  processMetadata,
  visionMaker,
} from "./utils.ts";
import { getLocalImages } from "./vision-bridge.ts";
import { logger } from "../conf/logger.ts";

const makeBuffer = () => Buffer.from("fake pdf content");

const RAW_PARTITION = [
  { type: "Text", element_id: "e1", text: "hello", metadata: {} },
];

const VISION_RESULT = {
  images: [{ page: 1, base64: "abc" }],
};

const VISION_ELEMENTS = [
  { type: "Text", element_id: "e1", text: "hello", metadata: {} },
  {
    type: "Image",
    element_id: "e2",
    text: "diagram",
    metadata: { image_base64: "abc" },
  },
];

const makeEnrichedElements = (visualCount = 1) => [
  { type: "Text", element_id: "e1", text: "hello", metadata: {} },
  ...Array.from({ length: visualCount }, (_, i) => ({
    type: "Image",
    element_id: `ev${i}`,
    text: "desc",
    metadata: { visual_description: "desc" },
  })),
];

const setupHappyPath = (visualCount = 1) => {
  vi.mocked(partitionDocument).mockResolvedValue(RAW_PARTITION as any);
  vi.mocked(getLocalImages).mockResolvedValue(VISION_RESULT as any);
  vi.mocked(visionMaker).mockReturnValue(VISION_ELEMENTS as any);
  vi.mocked(describeVisualElements).mockResolvedValue(
    makeEnrichedElements(visualCount) as any,
  );
  vi.mocked(processMetadata).mockResolvedValue(undefined as any);
};

describe("ingestDocument (buffer-based)", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns success:true on happy path", async () => {
    setupHappyPath();
    const result = await ingestDocument(makeBuffer(), "doc.pdf");
    expect(result.success).toBe(true);
  });

  it("returns correct totalChunks", async () => {
    setupHappyPath(2);
    const result = await ingestDocument(makeBuffer(), "doc.pdf");
    expect(result.totalChunks).toBe(3);
  });

  it("returns correct visualChunks", async () => {
    setupHappyPath(3);
    const result = await ingestDocument(makeBuffer(), "doc.pdf");
    expect(result.visualChunks).toBe(3);
  });

  it("visualChunks = 0 when none exist", async () => {
    vi.mocked(partitionDocument).mockResolvedValue(RAW_PARTITION as any);
    vi.mocked(getLocalImages).mockResolvedValue({ images: [] });
    vi.mocked(visionMaker).mockReturnValue(VISION_ELEMENTS as any);
    vi.mocked(describeVisualElements).mockResolvedValue([
      { type: "Text", element_id: "e1", metadata: {} },
    ] as any);
    vi.mocked(processMetadata).mockResolvedValue(undefined as any);

    const result = await ingestDocument(makeBuffer(), "doc.pdf");
    expect(result.visualChunks).toBe(0);
  });

  it("runs partitionDocument and getLocalImages in parallel", async () => {
    const calls: string[] = [];

    vi.mocked(partitionDocument).mockImplementation(async () => {
      calls.push("partition");
      return RAW_PARTITION as any;
    });

    vi.mocked(getLocalImages).mockImplementation(async () => {
      calls.push("images");
      return VISION_RESULT as any;
    });

    vi.mocked(visionMaker).mockReturnValue(VISION_ELEMENTS as any);
    vi.mocked(describeVisualElements).mockResolvedValue(
      makeEnrichedElements() as any,
    );
    vi.mocked(processMetadata).mockResolvedValue(undefined as any);

    await ingestDocument(makeBuffer(), "doc.pdf");

    expect(calls).toContain("partition");
    expect(calls).toContain("images");
  });

  it("calls visionMaker correctly", async () => {
    setupHappyPath();
    await ingestDocument(makeBuffer(), "file.pdf");

    expect(visionMaker).toHaveBeenCalledWith(
      RAW_PARTITION,
      VISION_RESULT,
      "file.pdf",
    );
  });

  it("calls getLocalImages with buffer", async () => {
    setupHappyPath();
    const buf = makeBuffer();
    await ingestDocument(buf, "doc.pdf");

    expect(getLocalImages).toHaveBeenCalledWith(buf);
  });

  it("logs start and completion", async () => {
    setupHappyPath();
    await ingestDocument(makeBuffer(), "doc.pdf");

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining("Starting"),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining("Completed"),
    );
  });

  it("throws PipelineException on failure", async () => {
    vi.mocked(partitionDocument).mockRejectedValue(new Error("fail"));
    vi.mocked(getLocalImages).mockResolvedValue({ images: [] });

    await expect(ingestDocument(makeBuffer(), "doc.pdf")).rejects.toThrow(
      "Document ingestion failed",
    );
  });
});
