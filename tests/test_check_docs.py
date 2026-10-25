from __future__ import annotations

import json
import io
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path

from scripts.check_docs import REPO_ROOT, check_evidence, check_markdown, main


class CheckDocsTests(unittest.TestCase):
    def test_main_reports_missing_research_link(self) -> None:
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            root = Path(directory)
            docs = root / "research" / "docs"
            evidence = docs / "evidence"
            evidence.mkdir(parents=True)
            (docs / "page.md").write_text("[missing](nope.md)\n", encoding="utf-8")
            with redirect_stderr(io.StringIO()) as diagnostics:
                self.assertEqual(main(root), 1)
            self.assertIn("missing local link target", diagnostics.getvalue())

    def test_main_reports_invalid_research_evidence(self) -> None:
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            root = Path(directory)
            evidence = root / "research" / "docs" / "evidence"
            evidence.mkdir(parents=True)
            (evidence / "sources.json").write_text("{\n", encoding="utf-8")
            with redirect_stderr(io.StringIO()) as diagnostics:
                self.assertEqual(main(root), 1)
            self.assertIn("invalid JSON", diagnostics.getvalue())

    def test_supports_balanced_parentheses_optional_title_and_encoded_fragment(self) -> None:
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            root = Path(directory)
            target = root / "target (v1).md"
            target.write_text("# Café\n", encoding="utf-8")
            page = root / "page.md"
            page.write_text("[target](target%20(v1).md#caf%C3%A9 \"source\")\n", encoding="utf-8")
            self.assertEqual(check_markdown(page, root), [])

    def test_ignores_fenced_links_and_headings(self) -> None:
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            root = Path(directory)
            target = root / "target.md"
            target.write_text("````md\n# hidden\n```\n[ignored](missing.md)\n````\n", encoding="utf-8")
            page = root / "page.md"
            page.write_text("```md\n[ignored](missing.md)\n```\n[target](target.md#hidden)\n", encoding="utf-8")
            self.assertEqual(len(check_markdown(page, root)), 1)

    def test_reports_missing_explicit_reference(self) -> None:
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            root = Path(directory)
            page = root / "page.md"
            page.write_text("[missing][source]\n", encoding="utf-8")
            self.assertEqual(len(check_markdown(page, root)), 1)

    def test_accepts_actual_evidence_entries(self) -> None:
        evidence_root = REPO_ROOT / "research" / "docs" / "evidence"
        if not evidence_root.exists():
            evidence_root = REPO_ROOT / "docs" / "research" / "evidence"
        for path in evidence_root.glob("*.json"):
            self.assertEqual(check_evidence(path, REPO_ROOT), [], path)

    def test_rejects_empty_evidence_claims(self) -> None:
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            path = Path(directory) / "sources.json"
            path.write_text(
                json.dumps(
                    [{"id": "source", "tool": "tool", "url": "https://example.com", "title": "title", "accessed": "2026-10-25", "claims": [""], "verification": "primary", "notes": "notes"}]
                ),
                encoding="utf-8",
            )
            self.assertEqual(len(check_evidence(path, REPO_ROOT)), 1)

    def test_main_rejects_duplicate_ids_across_ledgers(self) -> None:
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            root = Path(directory)
            evidence = root / "research" / "docs" / "evidence"
            evidence.mkdir(parents=True)
            entry = {"id": "SRC-01", "tool": "tool", "url": "https://example.com", "title": "title", "accessed": "2026-10-25", "claims": ["claim"], "verification": "primary", "notes": "notes"}
            for name in ("first.json", "second.json"):
                (evidence / name).write_text(json.dumps([entry]), encoding="utf-8")
            with redirect_stderr(io.StringIO()) as diagnostics:
                self.assertEqual(main(root), 1)
            self.assertIn("duplicate evidence id", diagnostics.getvalue())
            self.assertIn("first.json[0]", diagnostics.getvalue())

    def test_rejects_empty_evidence_id(self) -> None:
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            root = Path(directory)
            path = root / "sources.json"
            entry = {"id": " ", "tool": "tool", "url": "https://example.com", "title": "title", "accessed": "2026-10-25", "claims": ["claim"], "verification": "primary", "notes": "notes"}
            path.write_text(json.dumps([entry]), encoding="utf-8")
            self.assertEqual(check_evidence(path, root), ["sources.json[0]: id must be a non-empty string"])

    def test_rejects_padded_evidence_id(self) -> None:
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            root = Path(directory)
            path = root / "sources.json"
            entry = {"id": " SRC-01 ", "tool": "tool", "url": "https://example.com", "title": "title", "accessed": "2026-10-25", "claims": ["claim"], "verification": "primary", "notes": "notes"}
            path.write_text(json.dumps([entry]), encoding="utf-8")
            self.assertEqual(check_evidence(path, root), ["sources.json[0]: id must not contain surrounding whitespace"])


if __name__ == "__main__":
    unittest.main()
