"""Isolated server regressions; no lab data or running server required."""
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import serve


class ServerTests(unittest.TestCase):
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
