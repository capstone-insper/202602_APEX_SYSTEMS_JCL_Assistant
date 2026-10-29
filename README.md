# JCL Analyzer & Abend Assistant

Chat assistant that explains CardDemo JCL and IBM abend codes and messages (S0C7, IEF450I, ...), answering only from public IBM documentation and the CardDemo sources, always with citations.

Apex Systems use case 2, built by the Insper and Missouri S&T teams.

## Layout

| Folder | What |
|---|---|
| `frontend/` | React chat: history, answer with clickable citations, sources panel |
| `backend/` | FastAPI `POST /ask` |
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

The full schema is served at `/docs` when the API runs.

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
PYTHONPATH=../rag-llm JCL_ASSISTANT_STUB=1 uvicorn api.main:app --reload   # fixed answer, no AWS needed
```

Then the chat, in another terminal (Node 20.19+ or 22.12+):

```
cd frontend
npm ci
npm run dev        # http://localhost:5173, proxies /ask to the API on :8000
```

On Windows PowerShell, set the variables first: `$env:PYTHONPATH="../rag-llm"; $env:JCL_ASSISTANT_STUB="1"`.

Real answers call Claude Sonnet 4.5 on Amazon Bedrock and need AWS credentials. On the server
they come from the EC2 instance role; no key is stored in the code or the repo.

```
cd rag-llm
python -m rag.answer "STEP15 in POSTTRAN ended with S0C7, why?"
```

`BEDROCK_MODEL_ID` and `AWS_REGION` override the defaults (`us.anthropic.claude-sonnet-4-5-20250929-v1:0`, `us-east-1`).

## Evaluate

`eval/scenarios.yaml` has ten questions on the CardDemo jobs (JCL explanations, S0C7, S0C4, S806,
S322, IEF212I, a JCL error and one out-of-scope question), each with the expected cause, keywords
and sources. `run_eval.py` sends them to `/ask`, like the chat does, and scores each answer twice:
the expected sources are cited, and the answer has the expected terms. Results go to a CSV in
`eval/results/` for review.

```
python eval/run_eval.py                          # API on localhost:8000 (stub: only plumbing)
python eval/run_eval.py --url http://<server>    # real answers, about $0.04 each
pytest eval
```

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

Run it again to update. nginx serves `frontend/dist` on port 80 and proxies `/ask` and `/docs`, with a
rate limit on `/ask` because each call costs a Bedrock request.
