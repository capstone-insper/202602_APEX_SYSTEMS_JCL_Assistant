"""Semantic search over the Chroma index built by ingest.index."""

from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"  # rag-llm/data, whatever the working directory

import chromadb

INDEX = DATA / "index"
COLLECTION = "corpus"
CORPORA = {"jcl": ["jcl_step", "jcl_job"], "ibm": ["ibm_code", "ibm_message"]}


@lru_cache(maxsize=1)
def _collection(path: Path = INDEX):
    client = chromadb.PersistentClient(str(path), settings=chromadb.Settings(anonymized_telemetry=False))
    return client.get_collection(COLLECTION)


def search_docs(query: str, k: int = 5, corpus: str | None = None, collection=None) -> list[dict]:
    """Top k matches, one per source entry: {source, locator, snippet, url, kind, code, score}.

    corpus: "jcl" (CardDemo JCL) or "ibm" (IBM manuals); None searches both. The IBM side is
    ~15x larger, so without a filter it tends to crowd out JCL hits.
    """
    col = collection or _collection()
    where = {"kind": {"$in": CORPORA[corpus]}} if corpus else None
    # ponytail: big over-fetch because one long entry (EC6) has ~65 parts that collapse to one hit
    res = col.query(query_texts=[query], n_results=min(k * 20, col.count()), where=where)
    hits, seen = [], set()
    for doc, meta, dist in zip(res["documents"][0], res["metadatas"][0], res["distances"][0]):
        if meta["chunk_id"] in seen:  # several parts of one entry: keep the best
            continue
        seen.add(meta["chunk_id"])
        hits.append({"source": meta["source"], "locator": meta["locator"],
                     "snippet": doc.split("\n", 1)[-1], "url": meta["url"], "kind": meta["kind"],
                     "code": meta["code"], "score": round(1 - dist, 3)})
        if len(hits) == k:
            break
    return hits
