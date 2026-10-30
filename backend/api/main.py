import sqlite3
from collections.abc import Iterator

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from api import auth
from rag.answer import answer

app = FastAPI(title="JCL Analyzer & Abend Assistant")


@app.exception_handler(RequestValidationError)
async def invalid_request(request: Request, exc: RequestValidationError) -> JSONResponse:
    # FastAPI's default 422 echoes the input back (a password included) and fails with a 500
    # on some invalid Unicode; the field, the reason and the error type are enough.
    errors = [{"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": errors})


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


class LoginRequest(BaseModel):
    email: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=1024)
    remember: bool = False  # "Keep me signed in": 30 days instead of 12 hours


class User(BaseModel):
    email: str
    name: str


def db() -> Iterator[sqlite3.Connection]:
    con = auth.connect()
    try:
        yield con
    finally:
        con.close()


def current_user(jcl_session: str | None = Cookie(default=None),
                 con: sqlite3.Connection = Depends(db)) -> sqlite3.Row:
    user = auth.session_user(con, jcl_session) if jcl_session else None
    if user is None:
        raise HTTPException(401, "Sign in to continue.")
    return user


@app.post("/auth/login", response_model=User)
def login(req: LoginRequest, response: Response, jcl_session: str | None = Cookie(default=None),
          con: sqlite3.Connection = Depends(db)) -> dict:
    try:
        user = auth.authenticate(con, req.email, req.password)
    except auth.LoginError as e:
        raise HTTPException(e.status, str(e)) from None
    if jcl_session:  # a new sign-in never reuses a token the browser already had
        auth.end_session(con, jcl_session)
    token = auth.new_session(con, user["id"], req.remember)
    response.set_cookie(auth.COOKIE, token, max_age=auth.REMEMBER_SECONDS if req.remember else None,
                        httponly=True, samesite="strict", secure=auth.cookie_secure(), path="/")
    return {"email": user["email"], "name": user["name"]}


@app.post("/auth/logout", status_code=204)
def logout(response: Response, jcl_session: str | None = Cookie(default=None),
           con: sqlite3.Connection = Depends(db)) -> None:
    if jcl_session:
        auth.end_session(con, jcl_session)
    response.delete_cookie(auth.COOKIE, httponly=True, samesite="strict", secure=auth.cookie_secure(), path="/")


@app.get("/auth/me", response_model=User)
def me(user: sqlite3.Row = Depends(current_user)) -> dict:
    return {"email": user["email"], "name": user["name"]}


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest, user: sqlite3.Row = Depends(current_user)) -> dict:
    try:
        return answer(req.question, history=[t.model_dump() for t in req.history])
    except (BotoCoreError, ClientError) as e:  # throttling, AccessDenied, timeout
        raise HTTPException(502, "The model is unavailable, try again.") from e
