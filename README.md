# JCL Analyzer & Abend Assistant

Chat assistant that explains CardDemo JCL and IBM abend codes and messages (S0C7, IEF450I, ...), answering only from public IBM documentation and the CardDemo sources, always with citations.

Apex Systems use case 2, built by the Insper and Missouri S&T teams.

## Layout

| Folder | What |
|---|---|
| `ingest/` | Download and chunk the corpus, build the index |
| `rag/` | Retrieval, exact code lookup, prompt, `answer()` |
| `api/` | FastAPI `POST /ask` |
| `web/` (planned) | React chat |
| `eval/` (planned) | Test scenarios and evaluation script |
| `infra/` | EC2 setup script |
| `tests/` | Unit tests |

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

The full schema is served at `/docs` when the API runs.

## Run locally

```
python -m venv .venv
.venv/Scripts/activate      # Windows; on Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
pytest

python -m ingest.jcl        # clone CardDemo, chunk the JCL      -> data/chunks/jcl.jsonl
python -m ingest.ibm        # download the IBM manuals, chunk     -> data/chunks/ibm.jsonl
python -m ingest.index      # embed and index (~4 min)            -> data/index

JCL_ASSISTANT_STUB=1 uvicorn api.main:app --reload   # fixed answer, no AWS needed
```

Real answers call Claude Sonnet 4.5 on Amazon Bedrock and need AWS credentials. On the server
they come from the EC2 instance role; no key is stored in the code or the repo.

```
python -m rag.answer "STEP15 in POSTTRAN ended with S0C7, why?"
```

`BEDROCK_MODEL_ID` and `AWS_REGION` override the defaults (`us.anthropic.claude-sonnet-4-5-20250929-v1:0`, `us-east-1`).

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

Run it again to update. nginx serves `web/dist` on port 80 and proxies `/ask` and `/docs`, with a
rate limit on `/ask` because each call costs a Bedrock request.
