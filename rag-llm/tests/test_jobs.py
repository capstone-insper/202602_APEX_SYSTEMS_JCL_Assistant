import json

from rag.jobs import _jobs, find_steps


def step(job, name, source, start):
    return {"kind": "jcl_step", "job": job, "step": name, "source": source, "start_line": start, "text": name}


def corpus(tmp_path):
    _jobs.cache_clear()
    path = tmp_path / "jcl.jsonl"
    chunks = [{"kind": "jcl_job", "job": "POSTTRAN", "step": None, "source": "POSTTRAN.jcl", "start_line": 1},
              step("POSTTRAN", "STEP15", "POSTTRAN.jcl", 18),
              step("CREASTMT", "STEP010", "CREASTMT.JCL", 44),
              step("CREASTMT", "STEP040", "CREASTMT.JCL", 79),
              step("REPROC", "PRC001", "REPROC.prc", 1),
              step("REPROC", "PRC001", "TRANREPT.prc", 1),
              step("XREFFILE", "STEP05", "XREFFILE.jcl", 1)]
    path.write_text("\n".join(map(json.dumps, chunks)))
    return path


def test_job_name_brings_all_its_steps_and_no_job_card(tmp_path):
    steps = find_steps("what does creastmt do?", corpus(tmp_path))
    assert [s["step"] for s in steps] == ["STEP010", "STEP040"]
    assert find_steps("IEF450I POSTTRAN - ABEND=S0C7", corpus(tmp_path))[0]["step"] == "STEP15"


def test_named_step_narrows_the_job(tmp_path):
    steps = find_steps("CREASTMT abended S322 in STEP040.", corpus(tmp_path))
    assert [s["step"] for s in steps] == ["STEP040"]


def test_name_in_two_files_keeps_the_first(tmp_path):
    assert [s["source"] for s in find_steps("REPROC", corpus(tmp_path))] == ["REPROC.prc"]


def test_no_job_and_cap_on_jobs(tmp_path):
    path = corpus(tmp_path)
    assert find_steps("How do I write a REXX exec?", path) == []
    names = [s["job"] for s in find_steps("POSTTRAN REPROC XREFFILE POSTTRAN", path)]
    assert names == ["POSTTRAN", "REPROC"]
