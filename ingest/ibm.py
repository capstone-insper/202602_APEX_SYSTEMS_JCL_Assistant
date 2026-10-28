"""Chunk the public IBM z/OS 3.1 manuals: one chunk per abend code or message entry.

Run: python -m ingest.ibm   (reads the PDFs from data/raw/ibm, writes data/chunks/ibm.jsonl)
"""

import json
import re
from pathlib import Path

RAW = Path("data/raw/ibm")
OUT = Path("data/chunks/ibm.jsonl")
BASE = "https://www.ibm.com/docs/en/SSLTBW_3.1.0/pdf/"

BOOKS = [
    {"file": "ieah700_v3r1.pdf", "source": "z/OS MVS System Codes", "kind": "ibm_code",
     "heading": re.compile(r"^([0-9A-F]{3}|[0-9A-F]{2}x)$"),
     "pages": (7, 656)},  # printed pages of chapter 2, system completion (abend) codes
    {"file": "ieam800_v3r1.pdf", "source": "z/OS MVS System Messages, Vol 8 (IEF-IGD)",
     "kind": "ibm_message",
     "heading": re.compile(r"^(I[EFG][A-Z]{1,3}\d{3,5}[A-Z]?)\b"),  # IEF450I, IEFC001I, IEW0314, IGD101I
     "pages": None},
]

SECTIONS = {"System action", "Operator response", "User response", "Programmer response",
            "System programmer response", "Source", "Module", "Routing code", "Descriptor code"}

# Page footers: "Chapter 2. System completion codes  197", "198  z/OS: z/OS MVS ...",
# or "© Copyright IBM Corp. 1988, 2025 491" on the first page of a chapter.
FOOTER_RE = re.compile(r"^(?:Chapter \d+\..*?\s(\d+)|(\d+)\s+z/OS: .*|© Copyright IBM Corp\..*\s(\d+))$")


def split_page(text: str) -> tuple[list[str], int | None]:
    """Page lines without the footer, and the printed page number from it."""
    lines, printed = [], None
    for line in text.replace("\xa0", " ").splitlines():
        m = FOOTER_RE.match(line.strip())
        if m:
            printed = int(m.group(1) or m.group(2) or m.group(3))
        else:
            lines.append(line.rstrip())
    return lines, printed


def chunk_pages(pages: list[str], book: dict) -> list[dict]:
    # Flatten to (line, pdf_page, printed_page), keeping only the wanted printed range.
    rows = []
    for n, text in enumerate(pages, start=1):
        lines, printed = split_page(text)
        lo_hi = book["pages"]
        if lo_hi and (printed is None or not lo_hi[0] <= printed <= lo_hi[1]):
            continue
        rows += [(line, n, printed) for line in lines]

    # A heading is real when "Explanation" comes next, before any other section or heading.
    # This rejects module names ("Module / IEFAB487 / Routing code") and cross-references.
    starts = []
    for i, (line, _, _) in enumerate(rows):
        m = book["heading"].match(line.strip())
        if not m:
            continue
        for nxt, _, _ in rows[i + 1:i + 30]:
            nxt = nxt.strip()
            if nxt == "Explanation":
                starts.append((i, m.group(1)))
                break
            if nxt in SECTIONS or book["heading"].match(nxt):
                break

    chunks = []
    for k, (i, code) in enumerate(starts):
        j = starts[k + 1][0] if k + 1 < len(starts) else len(rows)
        part = rows[i:j]
        pdf_page, printed = part[0][1], part[0][2]
        chunks.append({
            "id": f"{book['file']}:{code}:{i}",  # i = row index; IBM repeats some ids on one page
            "source": book["source"], "kind": book["kind"], "code": code,
            "page": printed, "pdf_page": pdf_page, "end_pdf_page": part[-1][1],
            "url": f"{BASE}{book['file']}#page={pdf_page}",
            "text": "\n".join(r[0] for r in part).strip(),
        })
    return chunks


def load_pages(name: str) -> list[str]:
    """Text of each PDF page, cached as JSON because extraction takes ~30 s per book."""
    pdf, cache = RAW / name, RAW / (name + ".pages.json")
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    from pypdf import PdfReader
    if not pdf.exists():
        # ibm.com refuses scripted downloads, so the PDFs are put here by hand (see README).
        raise SystemExit(f"Missing {pdf}. Download {BASE + name} in a browser and save it there.")
    pages = [p.extract_text() or "" for p in PdfReader(pdf).pages]
    cache.write_text(json.dumps(pages), encoding="utf-8")
    return pages


def main():
    chunks = []
    for book in BOOKS:
        part = chunk_pages(load_pages(book["file"]), book)
        print(f"{book['source']}: {len(part)} entries")
        chunks += part
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        for c in chunks:
            f.write(json.dumps(c) + "\n")
    print(f"{len(chunks)} chunks -> {OUT}")


if __name__ == "__main__":
    main()
