# rag-llm

Corpus ingestion and the RAG pipeline behind `/ask`. See the [root README](../README.md) for setup.

| Folder | What |
|---|---|
| `ingest/` | Chunk CardDemo JCL (`jcl.py`) and the IBM manuals (`ibm.py`), build the Chroma index (`index.py`) |
| `rag/` | Exact code lookup (`codes.py`), semantic search (`search.py`), the Claude call with citations (`answer.py`) |
| `tests/` | Unit tests, no AWS needed |
| `data/` | Raw downloads, chunks and index; built locally, not in git |
