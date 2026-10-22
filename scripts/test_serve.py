"""Isolated server regressions; no lab data or running server required."""
import io
import json
from contextlib import contextmanager
from email.message import Message
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import serve


class ServerTests(unittest.TestCase):
    @contextmanager
    def file_handler(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = serve.Store(Path(tmp) / "test.db")
            h = serve.Handler.__new__(serve.Handler)
            h.headers = Message()
            h.who = lambda: None
            h.same_origin = lambda: True
            h.send_json = lambda body, status=200: (status, body)
            h.send_error = lambda status: (status, None)
            h.send_response = lambda status: None
            h.send_header = lambda *args: None
            h.end_headers = lambda: None
            h.command = "GET"
            h.wfile = io.BytesIO()
            try:
                with patch.object(serve, "STORE", store), patch.object(serve, "SECRET", "test secret"):
                    yield h, store
            finally:
                store.con.close()

    def test_signed_download_scope_expiry_and_auth(self):
        with self.file_handler() as (h, store):
            store.con.execute("INSERT INTO files VALUES (?,?,?)", ("pdf", "application/pdf", b"%PDF-test"))
            h.path = "/api/files/link"
            self.assertEqual(h._post({"id": "pdf"})[0], 401)
            h.who = lambda: "member"
            self.assertEqual(h._post({"id": "missing"})[0], 404)
            with patch.object(serve.time, "time", return_value=1000):
                url = h._post({"id": "pdf"})[1]["url"]
            h.who = lambda: None
            with patch.object(serve.time, "time", return_value=1001):
                h.path = url
                self.assertIsNone(h._get())
                self.assertEqual(h.wfile.getvalue(), b"%PDF-test")
                h.command = "HEAD"
                h.wfile = io.BytesIO()
                self.assertIsNone(h._get())
                self.assertEqual(h.wfile.getvalue(), b"")
                for bad in (url + "bad", url.replace("/pdf?", "/other?"), url.replace("exp=1600", "exp=1601")):
                    h.path = bad
                    self.assertEqual(h._get()[0], 403)
                h.path = url
                self.assertEqual(h.do_PUT()[0], 403)
                self.assertEqual(h.do_DELETE()[0], 401)
                query = url.split("?", 1)[1]
                for path in ("/api/state", "/api/whoami", "/api/snapshot"):
                    h.path = path + "?" + query
                    self.assertEqual(h._get()[0], 401)
                    self.assertEqual(h._post({})[0], 401)
            h.path = url
            with patch.object(serve.time, "time", return_value=1600):
                self.assertEqual(h._get()[0], 403)

    def test_signed_upload_pdf_limit_and_single_use(self):
        with self.file_handler() as (h, store):
            h.path = "/api/files/upload-link"
            self.assertEqual(h._post({})[0], 401)
            h.who = lambda: "member"
            link = h._post({})[1]
            h.path = link["url"]
            h.who = lambda: None
            self.assertEqual(h._get()[0], 403)

            def put(data, mime="application/pdf", length=None):
                h.headers = Message()
                h.headers["Content-Type"] = mime
                h.headers["Content-Length"] = str(len(data) if length is None else length)
                h.rfile = io.BytesIO(data)
                return h.do_PUT()

            self.assertEqual(put(b"%PDF-test", "text/plain")[0], 415)
            self.assertEqual(put(b"not PDF")[0], 415)
            self.assertEqual(put(b"%PDF", length=20 * 1024 * 1024 + 1)[0], 413)
            self.assertEqual(put(b"%PDF-test"), (200, {"ok": True, "id": link["id"], "size": 9}))
            self.assertEqual(put(b"%PDF-replace")[0], 409)
            self.assertEqual(store.con.execute("SELECT data FROM files WHERE id=?", (link["id"],)).fetchone()[0], b"%PDF-test")
            store.con.execute("DELETE FROM files WHERE id=?", (link["id"],))
            self.assertEqual(put(b"%PDF-recreate")[0], 409)
            h.path = "/api/files/upload-link"
            h.who = lambda: "member"
            with patch.object(serve.time, "time", return_value=1000):
                h.path = h._post({})[1]["url"]
            h.who = lambda: None
            with patch.object(serve.time, "time", return_value=1601):
                self.assertEqual(put(b"%PDF-expired")[0], 403)

    def test_style_guard_whoami_and_snapshot_privacy(self):
        with self.file_handler() as (h, store):
            alice = {"id": "alice", "name": "Alice", "role": "member", "style": "private Alice"}
            bob = {"id": "bob", "name": "Bob", "role": "member", "style": "private Bob"}
            admin = {"id": "admin", "name": "Admin", "role": "admin"}
            store.write([("users", u["id"], u) for u in (alice, bob, admin)], [])
            h.who = lambda: "alice"
            h.path = "/api/state"
            h._post({"upserts": [["users", "alice", {**alice, "style": "  own guidance  "}],
                                 ["users", "bob", {**bob, "style": "stolen"}]]})
            self.assertEqual(store.user("alice")["style"], "own guidance")
            self.assertEqual(store.user("bob")["style"], "private Bob")
            for invalid in (None, 4, "x" * 20001):
                h._post({"upserts": [["users", "alice", {**alice, "style": invalid}]]})
                self.assertEqual(store.user("alice")["style"], "own guidance")
            h.who = lambda: "admin"
            h._post({"upserts": [["users", "bob", {**bob, "style": "admin replacement"}]]})
            h._post({"upserts": [["users", "bob", {"id": "bob", "name": "Bob", "role": "member"}]]})
            self.assertEqual(store.user("bob")["style"], "private Bob")
            h.path = "/api/whoami"
            self.assertEqual(h._get()[1]["user"]["style"], "")
            h.who = lambda: "alice"
            self.assertEqual(h._get()[1]["user"]["style"], "own guidance")
            state = serve.without_secrets(store.db(), "alice")
            self.assertEqual(state["users"]["alice"]["style"], "own guidance")
            self.assertNotIn("style", state["users"]["bob"])
            h.path = "/api/snapshot"
            with patch.object(serve, "seed"):
                response = h._get()[1]
            self.assertNotIn('"style"', json.dumps(response))
            self.assertNotIn("private Bob", json.dumps(response))

    def test_record_boundary(self):
        self.assertFalse(serve.valid_records([["_meta", "users", {}]], 3))
        self.assertFalse(serve.valid_records([["reviews", "r"]], 3))
        self.assertFalse(serve.valid_records([["users", "u", {"id": "other", "name": "Member"}]], 3))
        self.assertTrue(serve.valid_records([["users", "u", {"id": "u", "name": "Member", "pw": True}]], 3))

    def test_password_edge_cases(self):
        self.assertEqual(serve.check_pw({"tempPw": "temporary"}, "한글"), (False, False))
        self.assertEqual(serve.check_pw({"pw": "pbkdf2$broken"}, "password"), (False, False))
        self.assertEqual(serve.check_pw({"pw": True}, "password"), (False, False))

    def test_static_auth_including_encoded_paths_and_head(self):
        h = serve.Handler.__new__(serve.Handler)
        h.directory = str(serve.SITE)
        h.who = lambda: None
        errors = []
        h.send_error = lambda status: errors.append(status)
        with patch.object(serve, "DEMO", False), patch.object(serve, "STORE", SimpleNamespace(lock=threading.RLock())):
            for command in ("GET", "HEAD"):
                for path in ("/data.js", "/%64ata.js", "/x/../data.js"):
                    h.command, h.path = command, path
                    self.assertIsNone(h.send_head())
        self.assertEqual(errors, [401] * 6)

    def test_cross_origin_writes(self):
        h = serve.Handler.__new__(serve.Handler)
        h.send_json = lambda body, status: self.assertEqual(status, 403)
        h.headers = {"Host": "localhost:8766", "Origin": "http://localhost:9999"}
        self.assertFalse(h.same_origin())
        h.headers = {"Host": "localhost:8766", "Origin": "http://localhost:8766"}
        self.assertTrue(h.same_origin())
        h.headers = {"Host": "localhost:8766"}  # MCP does not send an Origin.
        self.assertTrue(h.same_origin())

    def test_local_auth_cannot_write_browser_state_or_manage_tokens(self):
        h = serve.Handler.__new__(serve.Handler)
        h.who = lambda: serve.LOCAL
        h.send_json = lambda body, status: (body, status)
        for path in ("/api/state", "/api/state/import", "/api/tokens"):
            with self.subTest(path=path):
                h.path = path
                self.assertEqual(h._post({}), ({"error": "forbidden"}, 403))

    def test_delete_token_checks_owner_and_identifier(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = serve.Store(Path(tmp) / "test.db")
            h = serve.Handler.__new__(serve.Handler)
            h.same_origin = lambda: True
            h.who = lambda: "owner"
            h.send_json = lambda body: body
            h.send_error = lambda status: status
            try:
                token = store.new_session("owner", "mcp")
                tid = serve.sha(token)[:16]
                with patch.object(serve, "STORE", store):
                    h.path = "/api/tokens/" + tid
                    h.who = lambda: "other"
                    self.assertEqual(h.do_DELETE(), 404)
                    self.assertEqual(len(store.tokens("owner")), 1)
                    h.who = lambda: "owner"
                    h.path = "/api/tokens/" + tid + "bad"
                    self.assertEqual(h.do_DELETE(), 404)
                    h.path = "/api/tokens/" + tid
                    self.assertEqual(h.do_DELETE(), {"ok": True})
                    self.assertEqual(store.tokens("owner"), [])
            finally:
                store.con.close()

    def test_operation_log_and_records_commit_together(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = serve.Store(Path(tmp) / "test.db")
            op = {"id": "op1", "op": "test"}
            try:
                with patch.object(serve, "STORE", store), patch.object(serve.WORKER, "call", return_value={
                    "ok": True, "db": {"reviews": {"r": {"text": "test"}}, "setting": {"enabled": True}}
                }) as worker:
                    store.con.execute("CREATE TRIGGER reject_ops BEFORE INSERT ON ops BEGIN SELECT RAISE(ABORT, 'rejected'); END")
                    with self.assertRaises(Exception):
                        serve.apply_op(op)
                    self.assertEqual(store.version(), 0)
                    self.assertEqual(store.db(), {})
                    store.con.execute("DROP TRIGGER reject_ops")
                    self.assertTrue(serve.apply_op(op)["ok"])
                    self.assertEqual(store.db(), {"reviews": {"r": {"text": "test"}}, "setting": {"enabled": True}})
                    self.assertEqual(store.changes(0)["ops"][0]["id"], "op1")
                    self.assertEqual(store.changes(1), {"version": 1, "ops": []})
                    serve.apply_op({**op, "id": "noop"})
                    worker.reset_mock()
                    self.assertTrue(serve.apply_op({**op, "id": "noop"})["duplicate"])
                    worker.assert_not_called()
                    self.assertEqual(store.version(), 1)
            finally:
                store.con.close()


if __name__ == "__main__":
    unittest.main()
