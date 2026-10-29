# backend

FastAPI app serving `POST /ask`, sign-in (`/auth/login`, `/auth/logout`, `/auth/me`) and the schema at
`/docs`. Accounts and sessions are in SQLite (`api/auth.py`), managed with `python -m api.users`; see
"Sign-in" in the root README. It calls `rag.answer.answer()` from
`../rag-llm`, so run it with `PYTHONPATH=../rag-llm`. See the [root README](../README.md) for setup.
