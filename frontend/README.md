# frontend

React (Vite) chat that calls `POST /ask`, behind a sign-in screen. Three columns: chat history, the conversation, and the
sources cited by the selected answer. See the [root README](../README.md) for the `/ask` contract.

| File | What |
|---|---|
| `src/api.js` | The `/ask` call, the earlier exchanges of the open chat sent as `history`, sign-in (`login`, `logout`, `me`; the session is an HttpOnly cookie) and the error messages (timeout, rate limit, service down, session ended) |
| `src/detect.js` | Codes, job and step recognised in what the user types (same rules as `rag-llm/rag/codes.py`) |
| `src/format.js` | Answer text to paragraphs, lists and code blocks; answer to plain text for copying |
| `src/chats.js` | Chat history in `localStorage` (this browser only, one list per signed-in user, last 50 chats) |
| `src/components/` | `SignIn`, `Sidebar` (with the signed-in user and Sign out), `Thread` (questions, answers, composer), `Sources`, `Tags` |
| `test/` | Unit tests for `detect.js`, `format.js`, `api.js` and `chats.js` (`node:test`, no extra dependency) |

## Run

Needs Node 20.19+ or 22.12+ (Vite 8). Start the backend first (root README), then:

```
npm ci
npm run dev        # http://localhost:5173; /ask, /auth and /docs are proxied to http://127.0.0.1:8000
npm test
npm run lint
npm run build      # -> dist/, served by nginx on the server
```

`API_URL=http://host:port npm run dev` points the proxy at another backend. With the backend in
stub mode (`JCL_ASSISTANT_STUB=1`) every question gets the same fixed answer, with no citations.
