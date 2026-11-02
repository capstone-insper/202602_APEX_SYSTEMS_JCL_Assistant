# backend

FastAPI app serving `POST /ask`, sign-in (`/auth/login`, `/auth/logout`, `/auth/me`) and the schema at
`/docs`. Accounts and sessions are in SQLite (`api/auth.py`), managed with `python -m api.users`; see
"Sign-in" in the root README. It calls `rag.answer.answer()` from
`../rag-llm`, so run it with `PYTHONPATH=../rag-llm`. See the [root README](../README.md) for setup.

## How a question flows

On the server, nginx first applies the rate limit on `/ask` and proxies to the API. Then:

1. **Session and input** (`api/main.py`). `current_user` looks up the `jcl_session` cookie in SQLite, and
   the request must fit `AskRequest`: a question of up to 4000 characters and up to 10 earlier turns.
2. **Code lookup** (`rag/answer.py`, `rag/codes.py`). `answer()` finds the codes in the question (S0C7, or
   the typo SOC7, IEF450I, ...) and reads their exact entries from `data/chunks/ibm.jsonl`, so S0C7 is
   never confused with S0C4. These entries become the first numbered sources.
3. **Model call** (`rag/answer.py`). The question, the sources and the last 3 turns of history go to
   Claude on Bedrock. The model must answer only from the sources, citing them as `[n]`.
4. **Tools** (`rag/answer.py`, `rag/search.py`). If the sources are not enough, the model can call
   `lookup_code` or `search_docs`, the semantic search on the Chroma index in `data/index`. New results
   are added to the numbered sources. Each question gets at most 4 model calls; after that it answers
   "Not found in the docs."
5. **Citations** (`_Sources.finalize` in `rag/answer.py`). Cited sources are renumbered 1..n in order of
   first use, so `[n]` in the answer matches `citations[n-1]`, and markers that point at no source are
   dropped. An answer with no valid citation becomes "Not found in the docs."
6. **Response** (`api/main.py`). `AskResponse` returns `answer`, `codes` and `citations`.

With `JCL_ASSISTANT_STUB=1`, `answer()` returns a fixed answer right after step 1, with no corpus and no
AWS.

## Errors from /ask

| Status | When | From |
|---|---|---|
| 401 | No valid session | `current_user` |
| 422 | Invalid request; the input is not echoed back | `invalid_request` |
| 429 | Too many questions | nginx |
| 502 | Bedrock failed: throttling, access denied, timeout | `ask` |
| 503 | The chunks file or the index is missing, when the question needs it | `ask` |

An index that exists but is empty is not an error: the search finds nothing and the answer is usually
"Not found in the docs."

## Tests

`pytest` here needs no AWS and no corpus. `test_ask_goes_through_the_rag` runs the real `answer()` through
`/ask`, replacing only Bedrock and the corpus lookup; answers from the real model are checked with
`eval/run_eval.py`.
