import pytest
from fastapi.testclient import TestClient

from api import auth
from api.main import app

EMAIL, PASSWORD = "alex@company.com", "correct horse battery"


@pytest.fixture(autouse=True)
def db(tmp_path, monkeypatch):
    """Every test gets its own empty database and a clock it can move."""
    monkeypatch.setenv("JCL_DB", str(tmp_path / "jcl.db"))
    now = [1_800_000_000.0]
    monkeypatch.setattr(auth, "clock", lambda: now[0])
    con = auth.connect()
    auth.create_user(con, EMAIL, "Alex Rivera", PASSWORD)
    yield {"con": con, "now": now}
    con.close()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def signed_in(client):
    assert client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD}).status_code == 200
    return client
