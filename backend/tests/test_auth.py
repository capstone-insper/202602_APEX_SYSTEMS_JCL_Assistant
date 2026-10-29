import pytest

from api import auth
from api.users import main as users_cli
from conftest import EMAIL, PASSWORD


def login(client, password=PASSWORD, email=EMAIL, remember=False):
    return client.post("/auth/login", json={"email": email, "password": password, "remember": remember})


def test_ask_needs_a_session(client, monkeypatch):
    monkeypatch.setenv("JCL_ASSISTANT_STUB", "1")
    assert client.post("/ask", json={"question": "S0C7?"}).status_code == 401
    client.cookies.set(auth.COOKIE, "made-up-token")
    assert client.post("/ask", json={"question": "S0C7?"}).status_code == 401


def test_login_sets_an_httponly_cookie_and_me_answers(client):
    r = login(client, email="  Alex@Company.com ")  # case and spaces do not matter
    assert r.status_code == 200 and r.json() == {"email": EMAIL, "name": "Alex Rivera"}
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie and "max-age" not in cookie
    assert client.get("/auth/me").json()["email"] == EMAIL


def test_remember_me_keeps_the_cookie_for_30_days(client):
    assert f"max-age={auth.REMEMBER_SECONDS}" in login(client, remember=True).headers["set-cookie"].lower()


def test_wrong_password_and_unknown_email_get_the_same_answer(client):
    a, b = login(client, password="nope"), login(client, email="ghost@company.com")
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json() == {"detail": "Wrong email or password."}
    assert client.get("/auth/me").status_code == 401


def test_five_wrong_passwords_lock_the_account_for_15_minutes(client, db):
    for _ in range(4):
        assert login(client, password="nope").status_code == 401
    assert login(client, password="nope").status_code == 429
    assert login(client).status_code == 429  # even the right password, while locked
    db["now"][0] += auth.LOCK_SECONDS + 1
    assert login(client).status_code == 200


def test_a_right_password_resets_the_count(client):
    for _ in range(4):
        login(client, password="nope")
    assert login(client).status_code == 200
    assert login(client, password="nope").status_code == 401  # back to 1 failure, not locked


def test_logout_ends_the_session_on_the_server(signed_in):
    token = signed_in.cookies.get(auth.COOKIE)
    assert signed_in.post("/auth/logout").status_code == 204
    signed_in.cookies.clear()
    signed_in.cookies.set(auth.COOKIE, token)  # an old copy of the cookie is worthless
    assert signed_in.get("/auth/me").status_code == 401


def test_session_expires(signed_in, db):
    db["now"][0] += auth.SESSION_SECONDS + 1
    assert signed_in.get("/auth/me").status_code == 401


def test_a_new_login_replaces_the_old_token(signed_in):
    old = signed_in.cookies.get(auth.COOKIE)
    assert login(signed_in).status_code == 200
    assert signed_in.cookies.get(auth.COOKIE) != old
    signed_in.cookies.clear()
    signed_in.cookies.set(auth.COOKIE, old)
    assert signed_in.get("/auth/me").status_code == 401


def test_password_and_token_are_not_stored_in_clear(signed_in, db):
    con = db["con"]
    stored = con.execute("SELECT password_hash FROM users").fetchone()[0]
    assert PASSWORD not in stored and stored.startswith("scrypt$")
    token = signed_in.cookies.get(auth.COOKIE)
    assert con.execute("SELECT count(*) FROM sessions WHERE token_hash = ?", (token,)).fetchone()[0] == 0


def test_cli_disable_signs_the_user_out(signed_in, monkeypatch):
    users_cli(["disable", EMAIL])
    assert signed_in.get("/auth/me").status_code == 401
    assert login(signed_in).status_code == 401
    users_cli(["enable", EMAIL])
    assert login(signed_in).status_code == 200


def test_cli_reset_password_ends_sessions(signed_in, monkeypatch):
    monkeypatch.setattr("sys.stdin", __import__("io").StringIO("a brand new password\n"))
    users_cli(["reset-password", EMAIL, "--password-stdin"])
    assert signed_in.get("/auth/me").status_code == 401
    assert login(signed_in).status_code == 401
    assert login(signed_in, password="a brand new password").status_code == 200


def test_cli_refuses_short_passwords_and_duplicates(monkeypatch):
    monkeypatch.setattr("sys.stdin", __import__("io").StringIO("short\n"))
    with pytest.raises(SystemExit):
        users_cli(["add", "new@company.com", "--name", "New", "--password-stdin"])
    monkeypatch.setattr("sys.stdin", __import__("io").StringIO("long enough password\n"))
    with pytest.raises(SystemExit, match="already exists"):
        users_cli(["add", EMAIL, "--name", "Dup", "--password-stdin"])


def test_an_unknown_email_locks_like_a_real_one(client):
    # Otherwise 5 guesses would tell whether an account exists.
    real = [login(client, password="nope").status_code for _ in range(6)]
    ghost = [login(client, email="ghost@company.com").status_code for _ in range(6)]
    assert real == ghost == [401, 401, 401, 401, 429, 429]


def test_parallel_guesses_cannot_get_past_the_lock(db):
    from concurrent.futures import ThreadPoolExecutor

    def guess(password):
        con = auth.connect()
        try:
            auth.authenticate(con, EMAIL, password)
            return 200
        except auth.LoginError as e:
            return e.status
        finally:
            con.close()

    with ThreadPoolExecutor(max_workers=20) as pool:
        results = list(pool.map(guess, ["nope"] * 20))
    # Only the first MAX_FAILED attempts are checked, whatever the timing; the fifth locks.
    assert results.count(401) == auth.MAX_FAILED - 1 and results.count(429) == 20 - (auth.MAX_FAILED - 1)
    assert guess(PASSWORD) == 429  # the right password after the burst stays out


def test_logout_tells_the_browser_to_drop_the_cookie(signed_in):
    cookie = signed_in.post("/auth/logout").headers["set-cookie"].lower()
    assert cookie.startswith(f'{auth.COOKIE}=""') and "max-age=0" in cookie and "httponly" in cookie


def test_secure_cookie_only_when_asked(client, monkeypatch):
    assert "secure" not in login(client).headers["set-cookie"].lower()
    monkeypatch.setenv("JCL_COOKIE_SECURE", "1")
    assert "; secure" in login(client).headers["set-cookie"].lower()


def test_invalid_requests_do_not_echo_the_password(client):
    r = client.post("/auth/login", json={"email": EMAIL, "password": "p" * 1025 + "-secret"})
    assert r.status_code == 422 and "secret" not in r.text
    bad = client.post("/auth/login", content=b'{"email": "a@b.c", "password": "\\ud800"}',
                      headers={"Content-Type": "application/json"})
    assert bad.status_code in (401, 422)  # not a 500


def test_cli_validates_input_and_unlocks(client, monkeypatch):
    for argv in (["add", "not an email", "--name", "X"], ["add", "new@company.com", "--name", "   "]):
        monkeypatch.setattr("sys.stdin", __import__("io").StringIO("long enough password\n"))
        with pytest.raises(SystemExit):
            users_cli(argv + ["--password-stdin"])
    for _ in range(5):
        login(client, password="nope")
    assert login(client).status_code == 429
    users_cli(["unlock", EMAIL])
    assert login(client).status_code == 200
