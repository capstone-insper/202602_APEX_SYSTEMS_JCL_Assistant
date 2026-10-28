from ingest.ibm import BOOKS, chunk_pages

CODES, MESSAGES = BOOKS

CODE_PAGES = [
    "Intro text\n0C7\nExplanation\nnot a real entry, outside chapter 2\n1\xa0\xa0z/OS: z/OS MVS System Codes",
    "806\nExplanation\nModule not found.\n0C\nDCB not open.\nChapter 2. System completion codes\xa0\xa07",
    "more on 806\n8\xa0\xa0z/OS: z/OS MVS System Codes",
    "B37\nExplanation\nOut of space.\nChapter 2. System completion codes\xa0\xa09",
]

MESSAGE_PAGES = [
    "IEF450I jobname stepname - ABEND Scde\nREASON=xxxxxxxx\nExplanation\nA job step abnormally ended.\n"
    "Module\nIEFAB487\nRouting code\n2\nModule\nIEFAB473, IEFAB4FN\nRouting code\n3\nModule\nIEFAB457 IEFAB469\n"
    "IEF032I STEP/stepname/STOP\nCPU: 0 HR\nSRB: 0 HR\nVIRT: 1K\nSYS: 2K\nEXT: 3K\nSYS: 4K\nExplanation\nStep ended.\n"
    "© Copyright IBM Corp. 1988, 2025 29",
    "IEW0314 ERROR - TOO MANY REGIONS.\nExplanation\nOverlay error.\n30\xa0\xa0z/OS: z/OS MVS System Messages",
]


def test_codes():
    c806, cb37 = chunk_pages(CODE_PAGES, CODES)  # page with printed 1 is outside chapter 2
    assert (c806["code"], c806["page"], c806["pdf_page"], c806["end_pdf_page"]) == ("806", 7, 2, 3)
    assert "DCB not open." in c806["text"] and "more on 806" in c806["text"]
    assert "Chapter 2" not in c806["text"]  # footer dropped
    assert c806["url"].endswith("ieah700_v3r1.pdf#page=2")
    assert (cb37["code"], cb37["page"]) == ("B37", 9)


def test_messages_skip_module_names():
    ief450, ief032, iew0314 = chunk_pages(MESSAGE_PAGES, MESSAGES)
    assert (ief450["code"], ief450["page"]) == ("IEF450I", 29)
    assert "IEFAB487" in ief450["text"]  # kept as text, not split off as an entry
    assert ief032["code"] == "IEF032I"  # 7 lines of message text before Explanation
    assert (iew0314["code"], iew0314["page"]) == ("IEW0314", 30)
