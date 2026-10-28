# backend

FastAPI app serving `POST /ask` (and the schema at `/docs`). It calls `rag.answer.answer()` from
`../rag-llm`, so run it with `PYTHONPATH=../rag-llm`. See the [root README](../README.md) for setup.
