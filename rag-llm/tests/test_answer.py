import rag.answer as ra

ENTRY_0CX = {"source": "z/OS MVS System Codes", "code": "0Cx", "page": 194,
             "text": "0Cx\nExplanation\nProgram check.\n" + "filler\n" * 300 + "0C7\nData exception.\n0C8\nOverflow."}


class FakeBedrock:
    """Plays back scripted Converse responses and records what it was sent."""

    def __init__(self, *replies):
        self.replies, self.calls = list(replies), []

    def converse(self, **kw):
        self.calls.append(kw)
        return self.replies.pop(0)


def text_reply(text):
    return {"stopReason": "end_turn", "output": {"message": {"role": "assistant", "content": [{"text": text}]}}}


def tool_reply(name, args):
    return {"stopReason": "tool_use", "output": {"message": {"role": "assistant", "content": [
        {"toolUse": {"toolUseId": "t1", "name": name, "input": args}}]}}}


def setup(monkeypatch, search_hits=()):
    monkeypatch.delenv("JCL_ASSISTANT_STUB", raising=False)
    monkeypatch.setattr(ra, "lookup_code", lambda c: [ENTRY_0CX] if c.upper() in ("S0C7", "S0C4") else [])
    monkeypatch.setattr(ra, "search_docs", lambda q, corpus=None: list(search_hits))


def test_code_in_question_is_preloaded_and_cited(monkeypatch):
    setup(monkeypatch)
    fake = FakeBedrock(text_reply("Bad packed decimal data [1]. Fix the input record."))
    out = ra.answer("STEP15 ended SOC7, why?", client=fake)

    sent = fake.calls[0]["messages"][0]["content"][0]["text"]
    assert "[1] z/OS MVS System Codes | 0Cx, p. 194" in sent
    assert "0C7\nData exception." in sent  # the sub-code survives the cut of the long entry
    assert out["codes"] == ["S0C7"]
    assert out["citations"][0]["locator"] == "0Cx, p. 194"
    assert "0C7" in out["citations"][0]["snippet"]


def test_tool_call_then_answer(monkeypatch):
    hit = {"source": "carddemo/app/jcl/POSTTRAN.jcl", "locator": "lines 18-45", "snippet": "//STEP15 EXEC PGM=CBTRN02C"}
    setup(monkeypatch, [hit])
    fake = FakeBedrock(tool_reply("search_docs", {"query": "POSTTRAN", "corpus": "jcl"}),
                       text_reply("STEP15 runs CBTRN02C [1]."))
    out = ra.answer("What does POSTTRAN do?", client=fake)

    result = fake.calls[1]["messages"][2]["content"][0]["toolResult"]  # user, assistant tool call, tool result
    assert result["toolUseId"] == "t1" and "[1] carddemo/app/jcl/POSTTRAN.jcl" in result["content"][0]["text"]
    assert out["citations"] == [hit]


def test_uncited_answer_becomes_not_found(monkeypatch):
    setup(monkeypatch)
    out = ra.answer("What is the weather?", client=FakeBedrock(text_reply("Sunny.")))
    assert out == {"answer": "Not found in the docs.", "codes": [], "citations": []}


def test_endless_tool_calls_stop(monkeypatch):
    setup(monkeypatch)
    fake = FakeBedrock(*[tool_reply("search_docs", {"query": "x", "corpus": "ibm"})] * ra.MAX_TURNS)
    assert ra.answer("loop", client=fake)["answer"] == "Not found in the docs."
    assert len(fake.calls) == ra.MAX_TURNS


def test_bad_corpus_unknown_refs_and_long_snippets(monkeypatch):
    hit = {"source": "s", "locator": "lines 1-2", "snippet": "x" * 2000}
    seen = {}
    setup(monkeypatch, [hit])

    def search(q, corpus=None):
        seen["corpus"] = corpus
        return [hit]

    monkeypatch.setattr(ra, "search_docs", search)
    fake = FakeBedrock(tool_reply("search_docs", {"query": "q", "corpus": "everything"}),
                       text_reply("Answer [1][9]."))
    out = ra.answer("q", client=fake)
    assert seen["corpus"] is None  # invalid corpus falls back to both
    assert out["answer"] == "Answer [1]."
    assert len(out["citations"][0]["snippet"]) == ra.SNIPPET_CHARS
