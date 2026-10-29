from pathlib import Path

import yaml

from run_eval import cites, score

POSTTRAN = {"source": "carddemo/app/jcl/POSTTRAN.jcl", "locator": "lines 18-45", "snippet": ""}
CODE_0CX = {"source": "z/OS MVS System Codes", "locator": "0Cx, p. 41", "snippet": ""}


def test_scenarios_file_is_complete():
    scenarios = yaml.safe_load((Path(__file__).parent / "scenarios.yaml").read_text())["scenarios"]
    assert len(scenarios) == 10 and len({s["id"] for s in scenarios}) == 10
    for s in scenarios:
        assert s["question"] and s["expected_cause"]
        assert s.get("not_found") or (s["keywords"] and s["sources"])


def test_ibm_code_matches_its_entry_or_the_grouped_one():
    assert cites({"source": "z/OS MVS System Codes", "code": "0C7"}, CODE_0CX)
    assert not cites({"source": "z/OS MVS System Codes", "code": "806"}, CODE_0CX)
    assert cites({"source": "carddemo/app/jcl/POSTTRAN.jcl"}, POSTTRAN)


def test_score_reports_what_is_missing():
    scenario = {"keywords": [["data exception"], ["packed", "decimal"]],
                "sources": [{"source": "z/OS MVS System Codes", "code": "0C7"}]}
    good = {"answer": "A Data Exception: invalid packed field [1].", "codes": [], "citations": [CODE_0CX]}
    assert score(scenario, good) == {"source_ok": True, "answer_ok": True, "missing": ""}
    bad = {"answer": "Something about decimals.", "codes": [], "citations": [POSTTRAN]}
    assert score(scenario, bad) == {"source_ok": False, "answer_ok": False, "missing": "0C7; data exception"}


def test_not_found_wants_no_citations():
    scenario = {"not_found": True}
    assert score(scenario, {"answer": "Not found in the docs.", "codes": [], "citations": []})["answer_ok"]
    assert not score(scenario, {"answer": "Use LISTDS.", "codes": [], "citations": [POSTTRAN]})["source_ok"]
