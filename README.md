# JCL Analyzer & Abend Assistant

Chat assistant that explains CardDemo JCL and IBM abend codes and messages (S0C7, IEF450I, ...), answering only from public IBM documentation and the CardDemo sources, always with citations.

Apex Systems use case 2, built by the Insper and Missouri S&T teams.

## Layout

| Folder | What |
|---|---|
| `ingest/` (planned) | Download and chunk the corpus, build the index |
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
uvicorn api.main:app --reload
```

The answer is a fixed stub until the RAG is connected.
