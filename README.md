# JCL Analyzer & Abend Assistant

Chat assistant that explains CardDemo JCL and IBM abend codes and messages (S0C7, IEF450I, ...), answering only from public IBM documentation and the CardDemo sources, always with citations.

Apex Systems use case 2, built by the Insper and Missouri S&T teams.

## Layout

| Folder | What |
|---|---|
| `frontend/` | React chat behind a sign-in screen: history, answer with clickable citations, sources panel |
| `backend/` | FastAPI `POST /ask`, sign-in (`/auth/*`) and the accounts command line (`python -m api.users`) |
| `rag-llm/` | Corpus ingestion, index, exact code lookup, retrieval and the Claude call (`answer()`) |
| `infra/` | EC2 setup script |
| `eval/` | Test scenarios (`scenarios.yaml`) and the script that scores `/ask` on them (`run_eval.py`) |

`backend` imports `rag` from `rag-llm`; the corpus and index live in `rag-llm/data` (not in git).

## The /ask contract

```
POST /ask
{"question": "STEP15 ended S0C7, why?"}

200
{
  "answer": "...",
  "codes": ["S0C7"],
  "citations": [{"source": "MVS System Codes", "locator": "0C7", "snippet": "..."}]
}
```

Optional `history`: the earlier turns of the chat, oldest first, as `[{"question": "...", "answer": "..."}]`,
so a follow-up like "what does line 41 do?" keeps its context. The last 3 turns are sent to the model.

`/ask` needs a signed-in session (401 otherwise); see [Sign-in](#sign-in). The full schema is served
at `/docs` when the API runs.

## Run locally

One virtual environment at the repo root serves both Python folders.

```
python -m venv .venv
.venv/Scripts/activate      # Windows; on Linux/macOS: source .venv/bin/activate
pip install -r backend/requirements.txt    # includes rag-llm/requirements.txt

cd rag-llm
pytest
python -m ingest.jcl        # clone CardDemo, chunk the JCL      -> data/chunks/jcl.jsonl
python -m ingest.ibm        # chunk the IBM manuals (PDFs in data/raw/ibm) -> data/chunks/ibm.jsonl
python -m ingest.index      # embed and index (~4 min)            -> data/index

cd ../backend
pytest
python -m api.users add you@company.com --name "Your Name"   # an account to sign in with
PYTHONPATH=../rag-llm JCL_ASSISTANT_STUB=1 uvicorn api.main:app --reload   # fixed answer, no AWS needed
```

Then the chat, in another terminal (Node 20.19+ or 22.12+):

```
cd frontend
npm ci
npm run dev        # http://localhost:5173, proxies /ask and /auth to the API on :8000
```

On Windows PowerShell, set the variables first: `$env:PYTHONPATH="../rag-llm"; $env:JCL_ASSISTANT_STUB="1"`.

Real answers call Claude Sonnet 4.5 on Amazon Bedrock and need AWS credentials. On the server
they come from the EC2 instance role; no key is stored in the code or the repo.

```
cd rag-llm
python -m rag.answer "STEP15 in POSTTRAN ended with S0C7, why?"
```

`BEDROCK_MODEL_ID` and `AWS_REGION` override the defaults (`us.anthropic.claude-sonnet-4-5-20250929-v1:0`, `us-east-1`).

## Test

Automated, no AWS needed (from the repo root, with the virtual environment active):

```
(cd rag-llm && pytest)        # corpus, code lookup, citations
(cd backend && pytest)        # /ask contract, sign-in, sessions, lockout, accounts CLI
pytest eval                   # scoring of the evaluation script
(cd frontend && npm test && npm run lint && npm run build)
```

By hand, with the stub API and the chat running (see [Run locally](#run-locally)) and two accounts
made with `python -m api.users add`:

1. Open http://localhost:5173: the sign-in screen shows. A wrong password shows "Wrong email or password."
2. Sign in: the chat opens with your name and email at the bottom of the sidebar. Ask a question.
3. Reload the page: you stay signed in and the chat is still there.
4. Sign out (the arrow next to your name): back to sign-in. Sign in as the second account: it has no
   chats; sign back in as the first one and its chats are back.
5. `curl -X POST localhost:8000/ask -H "Content-Type: application/json" -d '{"question":"S0C7?"}'`
   answers 401: `/ask` needs a session.
6. Five wrong passwords lock the account for 15 minutes ("Too many failed attempts");
   `python -m api.users unlock <email>` lifts it.

## Evaluate

`eval/scenarios.yaml` has ten questions on the CardDemo jobs (JCL explanations, S0C7, S0C4, S806,
S322, IEF212I, a JCL error and one out-of-scope question), each with the expected cause, keywords
and sources. `run_eval.py` sends them to `/ask`, like the chat does, and scores each answer twice:
the expected sources are cited, and the answer has the expected terms. Results go to a CSV in
`eval/results/` for review.

```
export JCL_EVAL_EMAIL=eval@company.com                   # an account made with api.users
read -s JCL_EVAL_PASSWORD && export JCL_EVAL_PASSWORD   # typed, not left in the shell history
python eval/run_eval.py                          # API on localhost:8000 (stub: only plumbing)
python eval/run_eval.py --url http://<server>    # real answers, about $0.04 each
pytest eval
```

## Sign-in

Every user has an account; there is no sign-up page. An admin creates and manages accounts from
`backend/` (on the server, as the `jcl` user, with `JCL_DB=/var/lib/jcl/jcl.db`):

```
python -m api.users add alex@company.com --name "Alex Rivera"   # asks for the password
python -m api.users list
python -m api.users reset-password alex@company.com            # also ends their sessions
python -m api.users disable alex@company.com                   # and enable
python -m api.users unlock alex@company.com                    # lift a lock after 5 wrong passwords
```

`POST /auth/login` checks the password (scrypt hash in SQLite) and sets an HttpOnly, SameSite=Strict
session cookie for 12 hours, or 30 days with "Keep me signed in". Five wrong passwords lock the email
for 15 minutes, counted atomically so parallel guesses cannot get past it, and an unknown email locks
the same way, so the answers never reveal whether an account exists. At most 4 password checks run at
once (each takes ~32 MiB), and nginx limits sign-in attempts per IP. A sign-out the server does not
confirm keeps the user signed in and says so. `POST /auth/logout` ends the session on the
server; `GET /auth/me` returns the signed-in user. Chats stay in the browser, one list per user.

| Variable | Default | What |
|---|---|---|
| `JCL_DB` | `backend/jcl.db` | SQLite file with the accounts and sessions |
| `JCL_COOKIE_SECURE` | `0` | `1` adds the Secure flag to the cookie; only works behind HTTPS |

### Authentication: POC limits and production work

This is simple sign-in for a multi-user proof of concept. If the tool goes to production, these are
separate tasks:

- **Encryption in transit.** The POC serves plain HTTP, so passwords and the session cookie travel
  unencrypted; the IP allow list and test-only accounts limit the exposure. Production needs HTTPS with
  a domain and certificate (certbot, or a load balancer or CloudFront with an ACM certificate; Let's
  Encrypt does not issue for an IP or `*.amazonaws.com`), then `JCL_COOKIE_SECURE=1`.
- **Managed database** (RDS) with backups, instead of one SQLite file on one instance.
- **Workspaces and roles** (admin, member, viewer), with documents and chats per workspace.
- **Company SSO** (SAML or OIDC with the client's identity provider).
- **Invitations, sign-up and an admin screen**; the POC creates accounts from the command line.
- **Password recovery by email.**
- **Two-factor authentication.**
- **Chat history on the server per user**, available from any machine.
- **Audit log** of sign-ins, sign-outs and questions per user.
- **Configurable password policy and session length**, and ending a user's sessions from an admin screen.
- **Lockout without denial of service.** Anyone who can reach the app can lock a colleague's account for
  15 minutes with 5 wrong passwords (the admin can `unlock` it). Production would add per-IP and
  device-aware throttling, or CAPTCHA, instead of locking the account itself.

## Deploy on AWS

One Amazon Linux 2023 EC2 instance (t3.medium) with an instance role that can call Claude Sonnet 4.5
on Bedrock and read the IBM PDFs from a private S3 prefix. ibm.com refuses scripted downloads, so
the two PDFs (`ieah700_v3r1.pdf`, `ieam800_v3r1.pdf`) are downloaded in a browser and uploaded to
S3 once. Then, from Session Manager:

```
curl -fsSLo /tmp/setup.sh https://raw.githubusercontent.com/capstone-insper/202602_APEX_SYSTEMS_JCL_Assistant/main/infra/setup.sh
sudo nohup env IBM_PDFS_S3=s3://<bucket>/ibm/ bash /tmp/setup.sh > /tmp/setup.log 2>&1 &
tail -f /tmp/setup.log
```

Run it again to update. nginx serves `frontend/dist` on port 80 and proxies `/ask`, `/auth` and `/docs`, with a
rate limit on `/ask` because each call costs a Bedrock request.
