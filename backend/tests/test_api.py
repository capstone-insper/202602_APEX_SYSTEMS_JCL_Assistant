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
