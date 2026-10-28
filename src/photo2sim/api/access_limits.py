"""Persistent, atomic admission limits shared by everyone using an access tier."""

import math
import sqlite3
import time
from contextlib import closing
from uuid import uuid4

from fastapi import HTTPException

SESSION_SECONDS = {"student": 1800, "judge": 21600, "team": 43200}
# Maximum admitted operations per rolling 24 hours, minimum seconds between them.
LIMITS = {
    "student": {
        "mesh": (2, 300),
        "gemini": (10, 30),
        "simulation": (10, 30),
        "parse": (60, 5),
        "save": (120, 1),
    },
    "judge": {
        "mesh": (10, 30),
        "gemini": (40, 5),
        "simulation": (50, 5),
        "parse": (120, 2),
        "save": (500, 0.5),
    },
}


def request_abuse_action(method, path):
    path = path.rstrip("/")
    if method == "POST" and path in {"/api/assembly-jobs", "/api/assembly-jobs/from-meshes"}:
        return "parse"
    if (
        method == "PUT"
        and path.startswith("/api/assembly-jobs/")
        and path.endswith(("/revisions", "/mapping-review"))
    ):
        return "save"
    return None


def request_action(method, path):
    if method != "POST":
        return None
    path = path.rstrip("/")
    if path == "/api/jobs":
        return "mesh"
    if path.startswith("/api/jobs/") and path.endswith("/suggestions"):
        return "gemini"
    if path in {"/api/assembly-jobs", "/api/assembly-jobs/from-meshes"} or (
        path.startswith(("/api/jobs/", "/api/assembly-jobs/")) and path.endswith("/process")
    ):
        return "simulation"
    return None


class AccessLimits:
    def __init__(self, directory):
        self.database = directory / "access-usage.sqlite3"
        directory.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.database, timeout=10)) as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute(
                "CREATE TABLE IF NOT EXISTS usage "
                "(id TEXT PRIMARY KEY, role TEXT, action TEXT, created REAL)"
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS usage_window ON usage(role, action, created)"
            )
            connection.commit()

    def reserve(self, role, action):
        if role not in LIMITS or action is None:
            return None
        maximum, cooldown = LIMITS[role][action]
        now = time.time()
        with closing(sqlite3.connect(self.database, timeout=10)) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute("DELETE FROM usage WHERE created <= ?", (now - 86400,))
            rows = connection.execute(
                "SELECT created FROM usage WHERE role=? AND action=? ORDER BY created",
                (role, action),
            ).fetchall()
            retry = 0
            if len(rows) >= maximum:
                retry = rows[0][0] + 86400 - now
            elif rows:
                retry = rows[-1][0] + cooldown - now
            if retry > 0:
                seconds = max(1, math.ceil(retry))
                raise HTTPException(
                    429,
                    f"{role.title()} access {action} limit reached. Try again in "
                    f"{math.ceil(seconds / 60)} minute(s). Limits are shared by this access tier; "
                    "saved jobs and downloads remain available.",
                    headers={"Retry-After": str(seconds)},
                )
            reservation = str(uuid4())
            connection.execute(
                "INSERT INTO usage VALUES (?, ?, ?, ?)", (reservation, role, action, now)
            )
            return reservation

    def refund(self, reservation):
        if reservation is not None:
            with closing(sqlite3.connect(self.database, timeout=10)) as connection, connection:
                connection.execute("DELETE FROM usage WHERE id=?", (reservation,))
