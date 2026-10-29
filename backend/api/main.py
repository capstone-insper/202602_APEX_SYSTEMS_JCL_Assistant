from botocore.exceptions import BotoCoreError, ClientError
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from rag.answer import answer

app = FastAPI(title="JCL Analyzer & Abend Assistant")


class Turn(BaseModel):
    question: str = Field(max_length=4000)
    answer: str = Field(max_length=8000)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    history: list[Turn] = Field(default_factory=list, max_length=10)  # earlier turns, oldest first


class Citation(BaseModel):
    source: str  # e.g. "MVS System Codes" or "carddemo/jcl/POSTTRAN.jcl"
    locator: str  # IBM page or code entry, or JCL line
    snippet: str


class AskResponse(BaseModel):
    answer: str
    codes: list[str]
    citations: list[Citation]


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest) -> dict:
    try:
        return answer(req.question, history=[t.model_dump() for t in req.history])
    except (BotoCoreError, ClientError) as e:  # throttling, AccessDenied, timeout
        raise HTTPException(502, "The model is unavailable, try again.") from e
