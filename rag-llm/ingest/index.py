"""Build the Chroma index from data/chunks/*.jsonl.

Run: python -m ingest.index   (after ingest.jcl and ingest.ibm; rebuilds data/index from scratch)

Embeddings: Chroma's default local model (all-MiniLM-L6-v2), free and offline after a ~80 MB
first download. It reads only ~250 tokens per text, so long entries are split into parts and
each part repeats its header (code, book, page or job, step) to stay in context.
"""

import json
import shutil
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"  # rag-llm/data, whatever the working directory

import chromadb

CHUNKS = [DATA / "chunks/jcl.jsonl", DATA / "chunks/ibm.jsonl"]
INDEX = DATA / "index"
COLLECTION = "corpus"
PART_CHARS = 700  # ponytail: rough fit for the model's 256-token window; tune if retrieval misses


def citation(chunk: dict) -> tuple[str, str]:
    """(source, locator) as shown to the user."""
    if chunk["kind"].startswith("jcl"):
        return chunk["source"], f"lines {chunk['start_line']}-{chunk['end_line']}"
    return chunk["source"], f"{chunk['code']}, p. {chunk['page']}"


def header(chunk: dict) -> str:
    source, locator = citation(chunk)
    if chunk["kind"] == "jcl_step":
        return f"JCL job {chunk['job']} step {chunk['step'] or ''} runs {chunk['program']} ({source}, {locator})"
    if chunk["kind"] == "jcl_job":
        return f"JCL job {chunk['job']} job card ({source}, {locator})"
    return f"{chunk['code']}: {source}, {locator}"


def split(text: str, size: int = PART_CHARS) -> list[str]:
    """Parts of at most ~size chars, cut at line ends (a single longer line stays whole)."""
    parts, cur = [], ""
    for line in text.splitlines():
        if cur and len(cur) + len(line) + 1 > size:
            parts.append(cur)
            cur = ""
        cur = f"{cur}\n{line}" if cur else line
    return parts + [cur] if cur else parts


def records(chunks: list[dict]):
    for chunk in chunks:
        source, locator = citation(chunk)
        meta = {"chunk_id": chunk["id"], "kind": chunk["kind"], "source": source, "locator": locator,
                "code": chunk.get("code") or "", "url": chunk.get("url") or ""}
        for n, part in enumerate(split(chunk["text"])):
            yield f"{chunk['id']}#{n}", f"{header(chunk)}\n{part}", meta


def build(chunks: list[dict], path: Path = INDEX, embedding_function=None):
    shutil.rmtree(path, ignore_errors=True)
    client = chromadb.PersistentClient(str(path), settings=chromadb.Settings(anonymized_telemetry=False))
    kwargs = {"embedding_function": embedding_function} if embedding_function else {}
    col = client.create_collection(COLLECTION, metadata={"hnsw:space": "cosine"}, **kwargs)
    rows = list(records(chunks))
    for i in range(0, len(rows), 1000):
        ids, docs, metas = zip(*rows[i:i + 1000])
        col.add(ids=list(ids), documents=list(docs), metadatas=list(metas))
    return col


def main():
    chunks = [json.loads(line) for p in CHUNKS for line in p.open(encoding="utf-8")]
    col = build(chunks)
    print(f"{len(chunks)} chunks, {col.count()} parts -> {INDEX}")


if __name__ == "__main__":
    main()
