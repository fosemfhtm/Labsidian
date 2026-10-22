"""Pipeline regressions using only temporary fixtures; never read the lab's data.

    python -m unittest discover -s scripts -p test_pipeline.py
"""
import importlib.util
import io
import json
import math
import sys
import tempfile
import unittest
import urllib.error
import zipfile
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from build_site import norm_title, read_json, write_json, s2_key, s2_details
import demo_build
import design_lint
import enrich_s2
import parse_diary


class SharedDataTests(unittest.TestCase):
    def test_title_keys_preserve_diary_and_s2_conventions(self):
        self.assertEqual(norm_title(None), "")
        self.assertEqual(norm_title("한글: ﬁeld-ﬂow!"), "한글fieldflow")
        self.assertEqual(s2_key("한글: ﬁeld-ﬂow oﬃce!"), "fieldflowoffice")

    def test_json_and_s2_cache_loading(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "cache.json"
            with self.assertRaises(FileNotFoundError):
                s2_details(path)
            cache = {"match": {"한글": "p1", "missing": "p2", "unmatched": None},
                     "detail": {"p1": {"title": "한글"}}}
            write_json(path, cache, indent=1)
            self.assertEqual(read_json(path), cache)
            self.assertIn("한글", path.read_text(encoding="utf-8"))
            self.assertEqual(s2_details(path), {"한글": {"title": "한글"}, "missing": None})
            path.write_text("broken", encoding="utf-8")
            with self.assertRaises(json.JSONDecodeError):
                read_json(path)


class ParserTests(unittest.TestCase):
    roster = [{"name": "홍길동", "aliases": ["홍길"]}]

    def test_docx_namespace_break_attributes_and_unicode(self):
        xml = ('<x:document xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
               '<x:body><x:p><x:r><x:t>한글 &amp; text</x:t><x:br x:type="textWrapping"/>'
               '<x:t>next</x:t><x:tab/><x:t>end</x:t></x:r></x:p></x:body></x:document>')
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "diary.docx"
            with zipfile.ZipFile(path, "w") as doc:
                doc.writestr("word/document.xml", xml)
            self.assertEqual(list(parse_diary.docx_paragraphs(path)), ["한글 & text", "next\tend"])

    def test_name_mentions_fields_and_date_boundaries(self):
        lines = ["2026년 2월 28일", "홍길 1", "논문: Paper", "내용: Summary",
                 "홍길동의 방법이 좋다", "Link:", "not summary", "Memo: Memo",
                 "2026년 3월 1일", "논문: Other", "내용:"]
        entries = parse_diary.parse(lines, "2026H1", self.roster)
        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0]["author"], "홍길동")
        self.assertEqual(entries[0]["content"], "Summary\n홍길동의 방법이 좋다")
        self.assertEqual(entries[0]["link"], "")
        self.assertEqual(entries[0]["memo"], "Memo")
        self.assertEqual(entries[1]["author"], "미상")
        self.assertEqual(entries[1]["date"], "2026-03-01")
        self.assertEqual(entries[1]["content"], "")

    def test_invalid_calendar_date_fails(self):
        with self.assertRaises(ValueError):
            parse_diary.parse(["2026년 2월 30일", "논문: Paper"], "2026H1", self.roster)

    def test_name_with_another_members_name_as_suffix(self):
        roster = [{"name": "민수"}, {"name": "김민수"}]
        entries = parse_diary.parse(["2026년 3월 1일", "김민수 1", "논문: Paper"], "2026H1", roster)
        self.assertEqual(entries[0]["author"], "김민수")


class EnrichmentTests(unittest.TestCase):
    def test_retry_after_and_crossref_never_gets_s2_key(self):
        error = urllib.error.HTTPError("https://api.crossref.org/works", 429, "slow", {"Retry-After": "13"}, None)
        with patch.object(enrich_s2, "KEY", "secret"), patch.object(enrich_s2.urllib.request, "urlopen",
                side_effect=[error, io.BytesIO(b'{"message": {"items": []}}')]) as request, \
                patch.object(enrich_s2.time, "sleep") as sleep:
            self.assertEqual(enrich_s2.req("https://api.crossref.org/works", tries=2), {"message": {"items": []}})
            sleep.assert_called_once_with(13)
            self.assertIsNone(request.call_args.args[0].get_header("X-api-key"))

    def test_crossref_pii_falls_back_when_the_title_does_not_match(self):
        results = [{"message": {"items": [{"DOI": "wrong", "title": ["Another paper"]}]}},
                   {"message": {"items": [{"DOI": "right", "title": ["The target paper"]}]}}]
        with patch.object(enrich_s2, "req", side_effect=results):
            self.assertEqual(enrich_s2.ext_id("The target paper", "https://example.org/pii/S1234567890123456"), "DOI:right")

    def test_empty_search_results_are_cached_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            title = "An English paper title"
            key = s2_key(title)
            (data / "diary.json").write_text(json.dumps([{"title": title, "link": ""}]), encoding="utf-8")
            cache = data / "s2_cache.json"
            cache.write_text(json.dumps({"match": {}, "detail": {}, "ext": {key: ""}}), encoding="utf-8")
            with patch.object(enrich_s2, "DATA", data), patch.object(enrich_s2, "CACHE", cache), \
                    patch.object(enrich_s2, "req", return_value={"data": []}), \
                    patch.object(enrich_s2.time, "sleep"):
                enrich_s2.main()
            self.assertIsNone(json.loads(cache.read_text(encoding="utf-8"))["match"][key])

    def test_exhausted_batch_does_not_start_more_s2_phases(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            title = "A new paper title"
            (data / "diary.json").write_text(json.dumps([{"title": title}]), encoding="utf-8")
            cache = data / "s2_cache.json"
            cache.write_text(json.dumps({"match": {"old": "existing"}, "detail": {},
                                         "ext": {s2_key(title): "DOI:10.1234/example"}}), encoding="utf-8")
            with patch.object(enrich_s2, "DATA", data), patch.object(enrich_s2, "CACHE", cache), \
                    patch.object(enrich_s2, "req", return_value="retry") as request:
                enrich_s2.main()
            request.assert_called_once()
            self.assertEqual(json.loads(cache.read_text(encoding="utf-8"))["match"], {"old": "existing"})


class DemoSafetyTests(unittest.TestCase):
    def test_failed_checks_preserve_existing_outputs(self):
        for field, value in [("venue", "Real Member"), ("content", "one two three four five six seven eight"),
                             ("author", "Wrong Member"), ("content", "Original summary")]:
            with self.subTest(field=field), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                data, demo = root / "data", root / "demo"
                data.mkdir()
                (demo / "parts").mkdir(parents=True)
                (demo / "_work").mkdir()
                real = {"title": "Other paper", "author": "Real Member", "date": "2026-01-01",
                        "content": "one two three four five six seven eight", "memo": ""}
                (data / "diary.json").write_text(json.dumps([real]), encoding="utf-8")
                (data / "roster.json").write_text(json.dumps([{"name": "Real Member"}]), encoding="utf-8")
                (data / "s2_cache.json").write_text("broken", encoding="utf-8")
                (demo / "personas.json").write_text(json.dumps([{"id": "fake", "name": "Fake Member"}]), encoding="utf-8")
                (demo / "_work" / "fake.json").write_text(json.dumps({"slots": [{"date": "2026-02-01"}]}), encoding="utf-8")
                entry = dict.fromkeys(demo_build.FIELDS, "") | {"date": "2026-02-01", "author": "Fake Member",
                        "title": "A paper", "year": 2025, "rating": 3, "content": "Original summary", field: value}
                (demo / "parts" / "fake.json").write_text(json.dumps([entry]), encoding="utf-8")
                for name in ("diary.json", "roster.json", "s2_cache.json"):
                    (demo / name).write_text("unchanged", encoding="utf-8")
                with patch.object(demo_build, "ROOT", root), patch.object(demo_build, "DEMO", demo), \
                        redirect_stdout(io.StringIO()), \
                        self.assertRaises(json.JSONDecodeError if value == "Original summary" else SystemExit):
                    demo_build.main()
                for name in ("diary.json", "roster.json", "s2_cache.json"):
                    self.assertEqual((demo / name).read_text(encoding="utf-8"), "unchanged")


class LintTests(unittest.TestCase):
    def test_unclosed_colour_exemption_extends_to_eof(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sample.js"
            path.write_text('// design-lint: off (test)\nconst colour = "#abcdef";\n', encoding="utf-8")
            self.assertFalse(any(c == "js-color" for c, _, _ in design_lint.js_findings(path)))

    def test_missing_baseline_fails_without_creating_one(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            baseline = root / "missing.json"
            with patch.object(design_lint, "ROOT", root), patch.object(design_lint, "BASELINE", baseline), \
                    patch.object(design_lint, "collect", return_value=[]), redirect_stdout(io.StringIO()):
                self.assertEqual(design_lint.main([]), 1)
            self.assertFalse(baseline.exists())


@unittest.skipUnless(importlib.util.find_spec("numpy"), "needs numpy")
class MapTests(unittest.TestCase):
    def test_empty_map_and_finite_small_maps(self):
        import build_map
        import numpy as np
        with tempfile.TemporaryDirectory() as tmp, patch.object(build_map, "DATA", Path(tmp)), \
                patch.object(build_map, "load_papers", return_value=[]):
            build_map.main()
            self.assertEqual(json.loads((Path(tmp) / "map.json").read_text(encoding="utf-8"))["papers"], {})
        for n in (1, 2, 3):
            papers = [{"key": f"p{i}", "title": f"Paper {i}", "abstract": "", "reviews": []} for i in range(n)]
            with self.subTest(n=n), tempfile.TemporaryDirectory() as tmp, patch.object(build_map, "DATA", Path(tmp)), \
                    patch.object(build_map, "load_papers", return_value=papers), \
                    patch.object(build_map, "embed_specter2", return_value=np.eye(n)) as embed, \
                    patch.object(sys, "argv", ["build_map.py", "--reuse"]), redirect_stdout(io.StringIO()):
                build_map.main()
                out = json.loads((Path(tmp) / "map.json").read_text(encoding="utf-8"))
                self.assertTrue(all(math.isfinite(p[axis]) for p in out["papers"].values() for axis in ("x", "y", "mx", "my")))
                self.assertEqual(out["tagWeight"], build_map.TAG_WEIGHT)
                self.assertTrue(all(len(p["nb"]) == n - 1 for p in out["papers"].values()))
                embed.reset_mock()
                build_map.main()
                embed.assert_not_called()
                with patch.object(build_map, "MODEL", "another-model"):
                    build_map.main()
                embed.assert_called_once()
                embed.reset_mock()
                papers[0]["abstract"] = "Newly fetched abstract"
                build_map.main()
                embed.assert_called_once()

    def test_tag_matrix_allows_missing_review_text(self):
        import build_map
        papers = [{"title": "Deep learning", "reviews": [{"content": None}, {"memo": None}]}]
        tags = build_map.tag_matrix(papers, build_map.METHODS, 2)
        self.assertEqual(tags.shape, (1, len(build_map.METHODS)))
        self.assertTrue((tags >= 0).all())

    def test_lift_uses_other_papers_and_handles_missing_features(self):
        import numpy as np
        from eval_embeddings import evaluate
        papers = [{"_lang": "ko", "_reader": "a", "_tag": None, "_venue": "v"},
                  {"_lang": "ko", "_reader": "a", "_tag": None, "_venue": "v"},
                  {"_lang": "en", "_reader": "b", "_tag": "tag", "_venue": ""}]
        with redirect_stdout(io.StringIO()):
            row = evaluate("fixture", np.eye(3), papers)
        self.assertEqual(row["same_lang"], 1)
        self.assertEqual(row["same_reader"], 1)
        self.assertEqual(row["same_venue"], 1)
        self.assertTrue(math.isnan(row["same_tag"]))


if __name__ == "__main__":
    unittest.main()
