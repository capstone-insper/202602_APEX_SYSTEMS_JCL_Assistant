from botocore.exceptions import ClientError


def test_ask_returns_contract_shape(signed_in, monkeypatch):
    monkeypatch.setenv("JCL_ASSISTANT_STUB", "1")  # no AWS in tests
    r = signed_in.post("/ask", json={"question": "STEP15 ended S0C7, why?"})
    assert r.status_code == 200
    assert set(r.json()) == {"answer", "codes", "citations"}


def test_ask_rejects_empty_question(signed_in):
    assert signed_in.post("/ask", json={"question": ""}).status_code == 422


def test_ask_passes_history(signed_in, monkeypatch):
    seen = {}
    monkeypatch.setattr("api.main.answer", lambda q, history: seen.update(q=q, history=history)
                        or {"answer": "ok", "codes": [], "citations": []})
    turn = {"question": "What does the INTCALC job do?", "answer": "It computes interest."}
    r = signed_in.post("/ask", json={"question": "what does line 41 do?", "history": [turn]})
    assert r.status_code == 200 and seen["history"] == [turn]
    assert signed_in.post("/ask", json={"question": "q"}).status_code == 200  # history is optional


def test_ask_goes_through_the_rag(signed_in, monkeypatch):
    """The real answer(), with only Bedrock and the corpus files replaced."""
    monkeypatch.delenv("JCL_ASSISTANT_STUB", raising=False)
    entry = {"source": "z/OS MVS System Codes", "code": "0Cx", "page": 194, "text": "0Cx\nData exception."}
    monkeypatch.setattr("rag.answer.lookup_code", lambda code: [entry])
    monkeypatch.setattr("rag.answer.find_steps", lambda question: [])
    sent = []

    class FakeBedrock:
        def converse(self, **kw):
            sent.append(kw)
            return {"stopReason": "end_turn", "output": {"message": {
                "role": "assistant", "content": [{"text": "Bad packed decimal data [1]."}]}}}

    monkeypatch.setattr("rag.answer._bedrock", FakeBedrock)
    r = signed_in.post("/ask", json={"question": "STEP15 ended S0C7, why?"})
    assert r.status_code == 200
    assert r.json() == {"answer": "Bad packed decimal data [1].", "codes": ["S0C7"], "citations": [
        {"source": "z/OS MVS System Codes", "locator": "0Cx, p. 194", "snippet": "0Cx\nData exception."}]}
    assert "Data exception." in sent[0]["messages"][0]["content"][0]["text"]


def test_ask_model_failure_is_a_502(signed_in, monkeypatch):
    def throttled(q, history):
        raise ClientError({"Error": {"Code": "ThrottlingException", "Message": "slow down"}}, "Converse")

    monkeypatch.setattr("api.main.answer", throttled)
    r = signed_in.post("/ask", json={"question": "S0C7?"})
    assert r.status_code == 502 and "slow down" not in r.text


def test_ask_without_the_corpus_is_a_503(signed_in, monkeypatch):
    def not_built(q, history):
        raise FileNotFoundError("rag-llm/data/chunks/ibm.jsonl")

    monkeypatch.setattr("api.main.answer", not_built)
    r = signed_in.post("/ask", json={"question": "S0C7?"})
    assert r.status_code == 503 and "ibm.jsonl" not in r.text
