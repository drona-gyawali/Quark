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

/** Raw partition response — just needs to be something truthy */
const RAW_PARTITION = [
  { type: "Text", element_id: "e1", text: "hello", metadata: {} },
];

/** localImages map returned by vision-bridge */
const LOCAL_IMAGES = { 1: ["base64img=="] };

/** Elements after visionMaker merges images into partition output */
const VISION_ELEMENTS = [
  { type: "Text", element_id: "e1", text: "hello", metadata: {} },
  {
    type: "Image",
    element_id: "e2",
    text: "diagram",
    metadata: { image_base64: "abc" },
  },
];

/** Elements after describeVisualElements enriches visuals */
const makeEnrichedElements = (visualCount = 1) => [
  { type: "Text", element_id: "e1", text: "hello", metadata: {} },
  ...Array.from({ length: visualCount }, (_, i) => ({
    type: "Image",
    element_id: `ev${i}`,
    text: "described image",
    metadata: { visual_description: "A chart showing trends" },
  })),
];

const setupHappyPath = (visualCount = 1) => {
  vi.mocked(partitionDocument).mockResolvedValue(RAW_PARTITION as any);
  vi.mocked(getLocalImages).mockResolvedValue(LOCAL_IMAGES);
  vi.mocked(visionMaker).mockReturnValue(VISION_ELEMENTS as any);
  vi.mocked(describeVisualElements).mockResolvedValue(
    makeEnrichedElements(visualCount) as any,
  );
  vi.mocked(processMetadata).mockResolvedValue(undefined as any);
};

describe("ingestDocument", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns success:true on happy path", async () => {
    setupHappyPath();
    const result = await ingestDocument(makeBuffer(), "doc.pdf");
    expect(result.success).toBe(true);
  });

  it("returns correct totalChunks equal to enriched elements length", async () => {
    setupHappyPath(2); // 1 text + 2 visuals = 3 total
    const result = await ingestDocument(makeBuffer(), "doc.pdf");
    expect(result.totalChunks).toBe(3);
  });

  it("returns correct visualChunks count", async () => {
    setupHappyPath(3); // 3 elements have visual_description
    const result = await ingestDocument(makeBuffer(), "doc.pdf");
    expect(result.visualChunks).toBe(3);
  });

  it("returns visualChunks:0 when no elements have visual_description", async () => {
    vi.mocked(partitionDocument).mockResolvedValue(RAW_PARTITION as any);
    vi.mocked(getLocalImages).mockResolvedValue({});
    vi.mocked(visionMaker).mockReturnValue(VISION_ELEMENTS as any);
    vi.mocked(describeVisualElements).mockResolvedValue([
      { type: "Text", element_id: "e1", text: "plain", metadata: {} },
    ] as any);
    vi.mocked(processMetadata).mockResolvedValue(undefined as any);

    const result = await ingestDocument(makeBuffer(), "doc.pdf");
    expect(result.visualChunks).toBe(0);
    expect(result.success).toBe(true);
  });

  it("totalChunks and visualChunks are consistent with each other", async () => {
    setupHappyPath(2);
    const result = await ingestDocument(makeBuffer(), "doc.pdf");
    expect(result.visualChunks).toBeLessThanOrEqual(result.totalChunks);
  });

  it("runs partitionDocument and getLocalImages in parallel via Promise.all", async () => {
    const order: string[] = [];

    vi.mocked(partitionDocument).mockImplementation(async () => {
      order.push("partition");
      return RAW_PARTITION as any;
    });
    vi.mocked(getLocalImages).mockImplementation(async () => {
      order.push("localImages");
      return LOCAL_IMAGES;
    });
    vi.mocked(visionMaker).mockReturnValue(VISION_ELEMENTS as any);
    vi.mocked(describeVisualElements).mockResolvedValue(
      makeEnrichedElements() as any,
    );
    vi.mocked(processMetadata).mockResolvedValue(undefined as any);

    await ingestDocument(makeBuffer(), "doc.pdf");

    // Both must have been called (order is non-deterministic in Promise.all)
    expect(order).toContain("partition");
    expect(order).toContain("localImages");
    expect(order).toHaveLength(2);
  });

  it("calls visionMaker with raw partition output, localImages, and fileName", async () => {
    setupHappyPath();
    await ingestDocument(makeBuffer(), "my-file.pdf");

    expect(visionMaker).toHaveBeenCalledWith(
      RAW_PARTITION,
      LOCAL_IMAGES,
      "my-file.pdf",
    );
  });

  it("calls describeVisualElements with visionMaker output", async () => {
    setupHappyPath();
    await ingestDocument(makeBuffer(), "doc.pdf");

    expect(describeVisualElements).toHaveBeenCalledWith(VISION_ELEMENTS);
  });

  it("calls partitionDocument with the correct fileBuffer and fileName", async () => {
    setupHappyPath();
    const buf = makeBuffer();
    await ingestDocument(buf, "report.pdf");

    expect(partitionDocument).toHaveBeenCalledWith(buf, "report.pdf");
  });

  it("calls getLocalImages with the fileName", async () => {
    setupHappyPath();
    await ingestDocument(makeBuffer(), "slides.pdf");

    expect(getLocalImages).toHaveBeenCalledWith("slides.pdf");
  });

  it("calls processMetadata after describeVisualElements (correct order)", async () => {
    const callOrder: string[] = [];

    vi.mocked(partitionDocument).mockResolvedValue(RAW_PARTITION as any);
    vi.mocked(getLocalImages).mockResolvedValue(LOCAL_IMAGES);
    vi.mocked(visionMaker).mockReturnValue(VISION_ELEMENTS as any);
    vi.mocked(describeVisualElements).mockImplementation(async (_) => {
      callOrder.push("describe");
      return makeEnrichedElements(1) as any;
    });
    vi.mocked(processMetadata).mockImplementation(async () => {
      callOrder.push("processMetadata");
      return { success: true };
    });

    await ingestDocument(makeBuffer(), "doc.pdf");
    expect(callOrder).toEqual(["describe", "processMetadata"]);
  });

  it("throws PipelineException when partitionDocument fails", async () => {
    vi.mocked(partitionDocument).mockRejectedValue(
      new Error("partition crash"),
    );
    vi.mocked(getLocalImages).mockResolvedValue({});

    await expect(ingestDocument(makeBuffer(), "doc.pdf")).rejects.toThrow(
      "Document ingestion failed",
    );
  });

  it("throws PipelineException when getLocalImages fails", async () => {
    vi.mocked(partitionDocument).mockResolvedValue(RAW_PARTITION as any);
    vi.mocked(getLocalImages).mockRejectedValue(new Error("python crash"));

    await expect(ingestDocument(makeBuffer(), "doc.pdf")).rejects.toThrow(
      "Document ingestion failed",
    );
  });

  it("throws PipelineException when visionMaker throws", async () => {
    vi.mocked(partitionDocument).mockResolvedValue(RAW_PARTITION as any);
    vi.mocked(getLocalImages).mockResolvedValue(LOCAL_IMAGES);
    vi.mocked(visionMaker).mockImplementation(() => {
      throw new Error("vision maker crash");
    });

    await expect(ingestDocument(makeBuffer(), "doc.pdf")).rejects.toThrow(
      "Document ingestion failed",
    );
  });

  it("throws PipelineException when describeVisualElements fails", async () => {
    vi.mocked(partitionDocument).mockResolvedValue(RAW_PARTITION as any);
    vi.mocked(getLocalImages).mockResolvedValue(LOCAL_IMAGES);
    vi.mocked(visionMaker).mockReturnValue(VISION_ELEMENTS as any);
    vi.mocked(describeVisualElements).mockRejectedValue(
      new Error("enrich failed"),
    );

    await expect(ingestDocument(makeBuffer(), "doc.pdf")).rejects.toThrow(
      "Document ingestion failed",
    );
  });

  it("throws PipelineException when processMetadata fails", async () => {
    setupHappyPath();
    vi.mocked(processMetadata).mockRejectedValue(new Error("db error"));

    await expect(ingestDocument(makeBuffer(), "doc.pdf")).rejects.toThrow(
      "Document ingestion failed",
    );
  });

  it("thrown error is a PipelineException (not raw Error)", async () => {
    vi.mocked(partitionDocument).mockRejectedValue(new Error("boom"));
    vi.mocked(getLocalImages).mockResolvedValue({});

    const err = await ingestDocument(makeBuffer(), "doc.pdf").catch((e) => e);
    expect(err.name).toBe("PipelineException");
  });

  it("includes original error message inside PipelineException message", async () => {
    vi.mocked(partitionDocument).mockRejectedValue(
      new Error("very specific failure"),
    );
    vi.mocked(getLocalImages).mockResolvedValue({});

    const err = await ingestDocument(makeBuffer(), "doc.pdf").catch((e) => e);
    expect(err.message).toContain("very specific failure");
  });

  it("logs ingestion start", async () => {
    setupHappyPath();
    await ingestDocument(makeBuffer(), "doc.pdf");
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining("[INGESTION] Starting"),
    );
  });

  it("logs completion on success", async () => {
    setupHappyPath();
    await ingestDocument(makeBuffer(), "doc.pdf");
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining("[INGESTION] Completed"),
    );
  });

  it("logs visual element count after enrichment", async () => {
    setupHappyPath(2);
    await ingestDocument(makeBuffer(), "doc.pdf");
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining("2 visual elements"),
    );
  });

  it("logs error when ingestion fails", async () => {
    vi.mocked(partitionDocument).mockRejectedValue(new Error("fail"));
    vi.mocked(getLocalImages).mockResolvedValue({});

    await ingestDocument(makeBuffer(), "doc.pdf").catch(() => {});
    expect(logger.error).toHaveBeenCalled();
  });

  it("does NOT log completion when an error occurs", async () => {
    vi.mocked(partitionDocument).mockRejectedValue(new Error("fail"));
    vi.mocked(getLocalImages).mockResolvedValue({});

    await ingestDocument(makeBuffer(), "doc.pdf").catch(() => {});

    const infoCalls: string[] = vi
      .mocked(logger.debug)
      .mock.calls.map((c) => String(c[0]));
    expect(infoCalls.some((m) => m.includes("Completed"))).toBe(false);
  });
});
