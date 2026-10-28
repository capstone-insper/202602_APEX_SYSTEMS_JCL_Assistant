from fastapi import FastAPI
from pydantic import BaseModel, Field

from rag.answer import answer

app = FastAPI(title="JCL Analyzer & Abend Assistant")


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)


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
    return answer(req.question)
