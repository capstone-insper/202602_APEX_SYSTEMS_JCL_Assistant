from ingest.jcl import chunk_jcl

JCL = """\
//MYJOB   JOB 'TEST',CLASS=A,MSGCLASS=0
//*********************************
//* Copyright Example Corp.
//* language governing permissions
//*********************************
//* Load the daily file
//STEP10  EXEC PGM=PROG1
//IN      DD DISP=SHR,DSN=A.B.C                                         00010000
//SYSIN   DD *
  SORT FIELDS=COPY
/*
//* Run the report proc
//STEP20  EXEC PROC=REPROC,COND=(0,NE)
//        EXEC MYPROC
"""


def test_chunk_jcl():
    job, s10, s20, s30 = chunk_jcl(JCL, "x/MYJOB.jcl")

    assert job["kind"] == "jcl_job" and job["job"] == "MYJOB"
    assert (job["start_line"], job["end_line"]) == (1, 4)
    assert "Copyright" not in job["text"]

    assert (s10["step"], s10["program"]) == ("STEP10", "PROG1")
    # the comment block above the EXEC (banner + description) belongs to the step
    assert (s10["start_line"], s10["end_line"]) == (5, 11)
    assert "//* Load the daily file" in s10["text"]
    assert "00010000" not in s10["text"]  # sequence field dropped
    assert "SORT FIELDS=COPY" in s10["text"]

    assert (s20["step"], s20["program"], s20["start_line"]) == ("STEP20", "REPROC", 12)
    assert (s30["step"], s30["program"]) == (None, "MYPROC")
    assert s10["id"] == "x/MYJOB.jcl:5"
