"""Users, passwords and sessions for sign-in, kept in SQLite. Standard library only.

POC limits (see the root README): plain HTTP, accounts created from the command line
(python -m api.users), one instance. The database file is JCL_DB (default backend/jcl.db).
"""

import base64
import hashlib
import hmac
import os
import secrets
import sqlite3
import threading
import time
from functools import cache
from pathlib import Path

COOKIE = "jcl_session"
SESSION_SECONDS = 12 * 3600
REMEMBER_SECONDS = 30 * 24 * 3600  # "Keep me signed in"
MAX_FAILED = 5
LOCK_SECONDS = 15 * 60

# OWASP minimum for scrypt: N=2^15 (32 MiB), r=8, p=3.
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**15, 8, 3
SCRYPT_MAXMEM = 64 * 1024 * 1024
# Each hash takes ~32 MiB: at most 4 at a time, so a burst of logins cannot exhaust the memory
# the RAG index also needs. The others wait their turn.
_scrypt_slots = threading.BoundedSemaphore(4)

clock = time.time  # replaced in tests

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL
);
-- Failed sign-ins per email, accounts or not, so a lock looks the same for an unknown email.
CREATE TABLE IF NOT EXISTS login_attempts (
    email TEXT PRIMARY KEY,
    failed INTEGER NOT NULL DEFAULT 0,
    locked_until REAL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at REAL NOT NULL,
    created_at REAL NOT NULL
);
"""


class LoginError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


WRONG = LoginError(401, "Wrong email or password.")
LOCKED = LoginError(429, "Too many failed attempts. Try again in 15 minutes.")


def db_path() -> Path:
    return Path(os.environ.get("JCL_DB") or Path(__file__).resolve().parents[1] / "jcl.db")


def cookie_secure() -> bool:
    """Only with HTTPS; the POC runs on plain HTTP (JCL_COOKIE_SECURE=0)."""
    return os.environ.get("JCL_COOKIE_SECURE") == "1"


def connect() -> sqlite3.Connection:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    new = not path.exists()
    # One connection per request; FastAPI may run the dependency and the route on different threads.
    con = sqlite3.connect(path, check_same_thread=False)
    if new:
        os.chmod(path, 0o600)  # password hashes and session tokens: the service user only
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(SCHEMA)
    return con


def normalize(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    with _scrypt_slots:
        key = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P,
                             maxmem=SCRYPT_MAXMEM)
    salt64, key64 = base64.b64encode(salt).decode(), base64.b64encode(key).decode()
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt64}${key64}"


def check_password(password: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, key = stored.split("$")
        expected = base64.b64decode(key)
        with _scrypt_slots:
            got = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r),
                                 p=int(p), maxmem=SCRYPT_MAXMEM, dklen=len(expected))
    except (ValueError, UnicodeEncodeError):
        return False
    return hmac.compare_digest(got, expected)


@cache
def _dummy_hash() -> str:
    return hash_password(secrets.token_hex(16))


def create_user(con: sqlite3.Connection, email: str, name: str, password: str) -> int:
    try:
        cur = con.execute("INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)",
                          (normalize(email), name.strip(), hash_password(password), clock()))
    except sqlite3.IntegrityError:
        raise ValueError(f"{normalize(email)} already exists") from None
    con.commit()
    return cur.lastrowid


def authenticate(con: sqlite3.Connection, email: str, password: str) -> sqlite3.Row:
    """The user, or LoginError. Unknown, disabled and real accounts answer alike, locks included.

    The attempt is counted before the password is checked, in one statement, so parallel guesses
    each take a number: only the first MAX_FAILED are checked, the fifth wrong one locks the email.
    """
    email = normalize(email)
    now = clock()
    row = con.execute("SELECT locked_until FROM login_attempts WHERE email = ?", (email,)).fetchone()
    if row and row["locked_until"]:
        if row["locked_until"] > now:
            raise LOCKED
        con.execute("UPDATE login_attempts SET failed = 0, locked_until = NULL "
                    "WHERE email = ? AND locked_until <= ?", (email, now))  # the lock is over
    attempt = con.execute("INSERT INTO login_attempts (email, failed) VALUES (?, 1) "
                          "ON CONFLICT(email) DO UPDATE SET failed = failed + 1 RETURNING failed",
                          (email,)).fetchone()["failed"]
    con.commit()
    if attempt > MAX_FAILED:  # guesses sent in parallel with the one that locked
        raise LOCKED

    user = con.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if user and not user["disabled"] and check_password(password, user["password_hash"]):
        con.execute("DELETE FROM login_attempts WHERE email = ?", (email,))
        con.commit()
        return user
    if user is None or user["disabled"]:
        check_password(password, _dummy_hash())  # same work as a real check, so timing tells nothing
    if attempt == MAX_FAILED:
        con.execute("UPDATE login_attempts SET locked_until = ? WHERE email = ?", (now + LOCK_SECONDS, email))
        con.commit()
        raise LOCKED
    raise WRONG


def unlock(con: sqlite3.Connection, email: str) -> None:
    con.execute("DELETE FROM login_attempts WHERE email = ?", (normalize(email),))
    con.commit()


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_session(con: sqlite3.Connection, user_id: int, remember: bool) -> str:
    """A fresh random token for the cookie; only its hash is stored."""
    now = clock()
    token = secrets.token_urlsafe(32)
    con.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
    con.execute("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
                (_token_hash(token), user_id, now + (REMEMBER_SECONDS if remember else SESSION_SECONDS), now))
    con.commit()
    return token


def session_user(con: sqlite3.Connection, token: str) -> sqlite3.Row | None:
    return con.execute(
        "SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id "
        "WHERE token_hash = ? AND expires_at > ? AND NOT users.disabled",
        (_token_hash(token), clock())).fetchone()


def end_session(con: sqlite3.Connection, token: str) -> None:
    con.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))
    con.commit()


def end_all_sessions(con: sqlite3.Connection, user_id: int) -> None:
    con.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    con.commit()
