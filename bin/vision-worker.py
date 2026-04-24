import pdfplumber
import io
import sys
import json
import uuid
import os
import boto3
import asyncio
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv
load_dotenv()
# -----------------------------
# S3 CLIENT
# -----------------------------
s3 = boto3.client(
    "s3",
    endpoint_url="https://s3.eu-central-2.idrivee2.com",
    region_name="eu-central-2",
    aws_access_key_id=os.getenv("OBJECT_ID"),
    aws_secret_access_key=os.getenv("OBJECT_ACCESS_KEY"),
)
BUCKET = os.getenv("OBJECT_NAME")

# -----------------------------
# THREAD POOL (controls concurrency)
# -----------------------------
MAX_UPLOAD_WORKERS = 5
executor = ThreadPoolExecutor(max_workers=MAX_UPLOAD_WORKERS)


# -----------------------------
# Sync upload (wrapped in thread)
# -----------------------------
def upload_to_s3(image_bytes: bytes, key: str):
    s3.put_object(
        Bucket=BUCKET,
        Key=key,
        Body=image_bytes,
        ContentType="image/png",
    )
    return key


# -----------------------------
# Async wrapper for upload
# FIX: use get_running_loop() instead of deprecated get_event_loop()
# -----------------------------
async def async_upload(image_bytes: bytes, key: str):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(executor, upload_to_s3, image_bytes, key)


# -----------------------------
# Clamp bbox to page boundaries
# FIX: prevents "boundary" ValueError from pdfplumber/PDFMiner
# when image metadata coords slightly exceed page dimensions
# -----------------------------
def clamp_bbox(bbox, page):
    x0, top, x1, bottom = bbox
    x0 = max(0, min(x0, page.width))
    x1 = max(0, min(x1, page.width))
    top = max(0, min(top, page.height))
    bottom = max(0, min(bottom, page.height))
    return (x0, top, x1, bottom)


def is_valid_bbox(bbox):
    """Reject zero-area or inverted bboxes that would crash to_image()."""
    x0, top, x1, bottom = bbox
    return (x1 - x0) > 1 and (bottom - top) > 1


# -----------------------------
# Extract embedded images — SYNC only (pdfplumber is not thread-safe)
# FIX: all pdfplumber ops happen synchronously before any async work
# -----------------------------
def extract_images_from_page(page) -> list[bytes]:
    images = []
    for img in page.images:
        raw_bbox = (img["x0"], img["top"], img["x1"], img["bottom"])
        bbox = clamp_bbox(raw_bbox, page)

        if not is_valid_bbox(bbox):
            # bbox shrank to nothing after clamping — skip this image
            continue

        try:
            cropped = page.within_bbox(bbox).to_image(resolution=150)
            buf = io.BytesIO()
            cropped.original.save(buf, format="PNG")
            images.append(buf.getvalue())
        except Exception as e:
            # Log and continue rather than crashing the whole page
            print(f"[WARN] Skipping embedded image (bbox={bbox}): {e}", file=sys.stderr)

    return images


# -----------------------------
# Fallback: render the full page as one image
# -----------------------------
def render_page(page) -> bytes:
    img = page.to_image(resolution=200)
    buf = io.BytesIO()
    img.original.save(buf, format="PNG")
    return buf.getvalue()


# -----------------------------
# Extract all image bytes for one page — fully SYNC
# FIX: separates pdfplumber work (sync) from S3 uploads (async)
# -----------------------------
def extract_page_images(page) -> list[bytes]:
    images = extract_images_from_page(page)
    if not images:
        images = [render_page(page)]
    return images


# -----------------------------
# Async upload of pre-extracted image bytes for one page
# -----------------------------
async def upload_page_images(image_bytes_list: list[bytes], doc_id: str, page_num: int):
    results = []
    tasks = []

    for idx, image_bytes in enumerate(image_bytes_list):
        key = f"{doc_id}/page-{page_num}/{idx}.png"
        tasks.append((async_upload(image_bytes, key), key))

    for coro, key in tasks:
        await coro
        results.append({"page": page_num, "s3_key": key})

    return results


# -----------------------------
# Main async pipeline
# FIX: pdfplumber pages are extracted BEFORE gather() — safe and correct
# -----------------------------
async def process_pdf():
    doc_id = str(uuid.uuid4())
    pdf_bytes = sys.stdin.buffer.read()

    if not pdf_bytes:
        return json.dumps({"error": "No PDF received"})

    # --- Step 1: Extract ALL image bytes synchronously (pdfplumber is not async-safe) ---
    page_image_data = []  # list of (page_num, [image_bytes, ...])

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for i, page in enumerate(pdf.pages):
            page_num = i + 1
            try:
                images = extract_page_images(page)
                page_image_data.append((page_num, images))
            except Exception as e:
                print(f"[ERROR] Failed to extract page {page_num}: {e}", file=sys.stderr)
                page_image_data.append((page_num, []))

    upload_tasks = [
        upload_page_images(images, doc_id, page_num)
        for page_num, images in page_image_data
        if images
    ]

    pages_results = await asyncio.gather(*upload_tasks)

    results = []
    for r in pages_results:
        results.extend(r)

    return json.dumps({"doc_id": doc_id, "images": results})


if __name__ == "__main__":
    output = asyncio.run(process_pdf())
    print(output)