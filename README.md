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
| `infra/` (planned) | EC2 setup script |
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
