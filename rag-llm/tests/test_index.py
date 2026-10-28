import chromadb

from ingest.index import build, split
from rag.search import search_docs

WORDS = ["space", "data", "module", "job"]


class BagOfWords(chromadb.EmbeddingFunction):
    """Tiny offline stand-in for the real model: counts a few words."""

    def __init__(self):
        pass

    def __call__(self, input):
        return [[doc.lower().count(w) + 0.01 for w in WORDS] for doc in input]


def test_split_keeps_lines_and_size():
    text = "\n".join(f"line {i:03d} " + "x" * 40 for i in range(50))
    parts = split(text, size=200)
    assert all(len(p) <= 200 for p in parts)
    assert "\n".join(parts) == text  # nothing lost or duplicated


def test_build_and_search(tmp_path):
    chunks = [
        {"id": "b37", "kind": "ibm_code", "source": "z/OS MVS System Codes", "code": "B37", "page": 555,
         "url": "u#page=567", "text": "B37\nExplanation\nOut of space space space."},
        {"id": "806", "kind": "ibm_code", "source": "z/OS MVS System Codes", "code": "806", "page": 497,
         "url": "u#page=509", "text": "806\nExplanation\nModule not found.\n" + "module\n" * 300},
        {"id": "j1", "kind": "jcl_step", "source": "carddemo/app/jcl/POSTTRAN.jcl", "job": "POSTTRAN",
         "step": "STEP15", "program": "CBTRN02C", "start_line": 18, "end_line": 45, "text": "//STEP15 EXEC"},
    ]
    col = build(chunks, tmp_path / "index", embedding_function=BagOfWords())
    assert col.count() > 3  # the long 806 entry was split into parts

    hits = search_docs("module module", k=2, collection=col)
    assert hits[0]["locator"] == "806, p. 497"
    assert len({h["locator"] for h in hits}) == len(hits)  # one hit per entry
    assert search_docs("space", k=1, collection=col)[0]["url"] == "u#page=567"
    assert search_docs("module", k=1, corpus="jcl", collection=col)[0]["kind"] == "jcl_step"
    job = search_docs("job", k=1, collection=col)[0]
    assert (job["source"], job["locator"]) == ("carddemo/app/jcl/POSTTRAN.jcl", "lines 18-45")
