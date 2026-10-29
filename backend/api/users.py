"""Manage sign-in accounts. There is no sign-up page: an admin creates accounts here.

  cd backend
  python -m api.users add alex@company.com --name "Alex Rivera"     # asks for the password
  python -m api.users list
  python -m api.users reset-password alex@company.com               # also unlocks and signs them out
  python -m api.users disable alex@company.com                      # and enable
  python -m api.users unlock alex@company.com                       # lift a lock (5 wrong passwords)

--password-stdin reads the password from stdin instead of asking, for scripts.
Uses the same database as the API (JCL_DB).
"""

import argparse
import getpass
import re
import sys
from datetime import datetime

from api import auth

MIN_PASSWORD = 8
MAX_PASSWORD = 1024  # the API refuses longer ones (LoginRequest in main.py)
EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")  # what the sign-in form's type="email" accepts


def read_password(from_stdin: bool) -> str:
    if from_stdin:
        password = sys.stdin.readline().rstrip("\r\n")  # \r too, for input piped on Windows
    else:
        password = getpass.getpass("Password: ")
        if getpass.getpass("Again: ") != password:
            sys.exit("The passwords do not match.")
    if not MIN_PASSWORD <= len(password) <= MAX_PASSWORD:
        sys.exit(f"Use between {MIN_PASSWORD} and {MAX_PASSWORD} characters.")
    return password


def find(con, email: str):
    user = con.execute("SELECT * FROM users WHERE email = ?", (auth.normalize(email),)).fetchone()
    if user is None:
        sys.exit(f"No account for {auth.normalize(email)}.")
    return user


def main(argv=None):
    p = argparse.ArgumentParser(description="Manage JCL Assistant accounts.")
    sub = p.add_subparsers(dest="cmd", required=True)
    add = sub.add_parser("add", help="create an account")
    add.add_argument("email")
    add.add_argument("--name", required=True)
    add.add_argument("--password-stdin", action="store_true")
    reset = sub.add_parser("reset-password", help="set a new password and end the user's sessions")
    reset.add_argument("email")
    reset.add_argument("--password-stdin", action="store_true")
    for cmd in ("disable", "enable"):
        sub.add_parser(cmd, help=f"{cmd} an account").add_argument("email")
    sub.add_parser("unlock", help="lift the lock after failed sign-ins").add_argument("email")
    sub.add_parser("list", help="list the accounts")
    args = p.parse_args(argv)

    con = auth.connect()
    if args.cmd == "add":
        if not EMAIL_RE.fullmatch(auth.normalize(args.email)):
            sys.exit(f"{args.email!r} is not an email address the sign-in form accepts.")
        if not args.name.strip():
            sys.exit("The name cannot be empty.")
        try:
            auth.create_user(con, args.email, args.name, read_password(args.password_stdin))
        except ValueError as e:
            sys.exit(str(e))
        print(f"Created {auth.normalize(args.email)}.")
    elif args.cmd == "reset-password":
        user = find(con, args.email)
        con.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                    (auth.hash_password(read_password(args.password_stdin)), user["id"]))
        con.commit()
        auth.unlock(con, user["email"])
        auth.end_all_sessions(con, user["id"])
        print(f"New password set for {user['email']}; their sessions were ended.")
    elif args.cmd == "unlock":
        auth.unlock(con, args.email)
        print(f"{auth.normalize(args.email)} unlocked.")
    elif args.cmd in ("disable", "enable"):
        user = find(con, args.email)
        con.execute("UPDATE users SET disabled = ? WHERE id = ?", (args.cmd == "disable", user["id"]))
        con.commit()
        if args.cmd == "disable":
            auth.end_all_sessions(con, user["id"])
        print(f"{user['email']} {args.cmd}d.")
    else:
        locked = {r["email"] for r in con.execute("SELECT email FROM login_attempts WHERE locked_until > ?",
                                                   (auth.clock(),))}
        for u in con.execute("SELECT * FROM users ORDER BY email"):
            state = "disabled" if u["disabled"] else "locked" if u["email"] in locked else "active"
            print(f"{u['email']:<36} {u['name']:<24} {state:<9} since {datetime.fromtimestamp(u['created_at']):%Y-%m-%d}")


if __name__ == "__main__":
    main()
