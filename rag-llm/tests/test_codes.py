import json

from rag.codes import _entries, find_codes, lookup_code


def test_find_codes():
    q = "STEP15 in POSTTRAN ended with SOC7, earlier S806-04 and abend 322; then IEF450I. Also SADD."
    assert find_codes(q) == ["S0C7", "S806", "S322", "IEF450I"]
    assert find_codes("ABEND=SB37 then s0c4") == ["SB37", "S0C4"]
    assert find_codes("job ended JCL error") == []
    assert find_codes("abend bad data, abend code 0C7") == ["S0C7"]
    assert find_codes("return code 0004, condition code 12, error code 100, social OCA") == []


def test_lookup_code(tmp_path):
    path = tmp_path / "ibm.jsonl"
    rows = [{"code": "0Cx", "text": "program check"}, {"code": "806", "text": "not found"},
            {"code": "IEF450I", "text": "step abended"}]
    path.write_text("\n".join(json.dumps(r) for r in rows), encoding="utf-8")
    _entries.cache_clear()

    assert lookup_code("S0C7", path)[0]["code"] == "0Cx"
    assert lookup_code("806", path)[0]["text"] == "not found"
    assert lookup_code("ief450i", path)[0]["code"] == "IEF450I"
    assert lookup_code("S999", path) == []
    _entries.cache_clear()
