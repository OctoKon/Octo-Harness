#!/usr/bin/env python3
"""Check supported local Markdown links and research evidence with the standard library.

Shortcut reference links (``[label]``) are intentionally unsupported because they
are indistinguishable from ordinary bracketed prose without a full Markdown parser.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from html import unescape as html_unescape
from pathlib import Path
from urllib.parse import unquote, urlparse

REPO_ROOT = Path(__file__).resolve().parents[1]
REQUIRED_EVIDENCE_FIELDS = {"id", "tool", "url", "title", "accessed", "claims", "verification", "notes"}
FENCE = re.compile(r"^\s{0,3}(`{3,}|~{3,})", re.MULTILINE)
REFERENCE_LINK = re.compile(r"(?<!!)\[([^\]]+)\]\[([^\]]*)\]")
REFERENCE_DEFINITION = re.compile(r"^\s{0,3}\[([^\]]+)\]:\s*(\S+)", re.MULTILINE)
HEADING = re.compile(r"^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$", re.MULTILINE)


def without_fences(markdown: str) -> str:
    lines: list[str] = []
    marker = ""
    for line in markdown.splitlines(keepends=True):
        match = FENCE.match(line)
        if match:
            fence = match.group(1)
            if not marker:
                marker = fence
            elif fence[0] == marker[0] and len(fence) >= len(marker):
                marker = ""
            lines.append("\n")
        elif marker:
            lines.append("\n")
        else:
            lines.append(line)
    return "".join(lines)


def normalize_reference_label(label: str) -> str:
    return " ".join(label.casefold().split())


def inline_destinations(markdown: str) -> list[str]:
    destinations: list[str] = []
    index = 0
    while index < len(markdown):
        if markdown[index] != "[" or (index and markdown[index - 1] == "!"):
            index += 1
            continue
        close_label = markdown.find("]", index + 1)
        if close_label < 0 or close_label + 1 >= len(markdown) or markdown[close_label + 1] != "(":
            index += 1
            continue
        depth, cursor = 1, close_label + 2
        while cursor < len(markdown) and depth:
            if markdown[cursor] == "\\":
                cursor += 2
                continue
            if markdown[cursor] == "(":
                depth += 1
            elif markdown[cursor] == ")":
                depth -= 1
            cursor += 1
        if depth:
            index += 1
            continue
        contents = markdown[close_label + 2 : cursor - 1].strip()
        if contents.startswith("<") and ">" in contents:
            destinations.append(contents[1 : contents.index(">")])
        elif contents:
            destinations.append(contents.split(None, 1)[0])
        index = cursor
    return destinations


def github_anchors(markdown: str) -> set[str]:
    anchors: set[str] = set()
    seen: dict[str, int] = {}
    for heading in HEADING.findall(without_fences(markdown)):
        text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", heading)
        text = html_unescape(re.sub(r"[`*~]", "", text)).strip().lower()
        slug = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE)
        slug = re.sub(r"\s", "-", slug)
        suffix = seen.get(slug, 0)
        seen[slug] = suffix + 1
        anchors.add(f"{slug}-{suffix}" if suffix else slug)
    return anchors


def markdown_targets(markdown: str) -> tuple[list[str], list[str]]:
    markdown = without_fences(markdown)
    definitions = {
        normalize_reference_label(label): target.strip("<>")
        for label, target in REFERENCE_DEFINITION.findall(markdown)
    }
    targets = inline_destinations(markdown)
    missing_references: list[str] = []
    for text, label in REFERENCE_LINK.findall(markdown):
        target = definitions.get(normalize_reference_label(label or text))
        if target is None:
            missing_references.append(label or text)
        else:
            targets.append(target)
    return targets, missing_references


def display_path(path: Path, root: Path) -> Path:
    try:
        return path.relative_to(root)
    except ValueError:
        return path


def check_markdown(path: Path, root: Path = REPO_ROOT) -> list[str]:
    errors: list[str] = []
    markdown = path.read_text(encoding="utf-8")
    targets, missing_references = markdown_targets(markdown)
    source = display_path(path, root)
    errors.extend(f"{source}: missing reference definition: {label}" for label in missing_references)
    for target in targets:
        parsed = urlparse(target)
        if parsed.scheme:
            if parsed.scheme == "mailto" and parsed.path:
                continue
            if parsed.netloc:
                continue
            errors.append(f"{source}: URL scheme requires a host: {target}")
            continue
        if parsed.netloc:
            continue
        location, _, fragment = target.partition("#")
        location = unquote(location.split("?", 1)[0])
        linked_path = path if not location else (path.parent / location).resolve()
        if not linked_path.is_file():
            errors.append(f"{source}: missing local link target: {target}")
            continue
        if fragment and linked_path.suffix.lower() in {".md", ".markdown"}:
            if unquote(fragment) not in github_anchors(linked_path.read_text(encoding="utf-8")):
                errors.append(f"{source}: missing fragment: {target}")
    return errors


def check_evidence(path: Path, root: Path = REPO_ROOT) -> list[str]:
    source = display_path(path, root)
    try:
        entries = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        return [f"{source}: invalid JSON: {error.msg}"]
    if not isinstance(entries, list):
        return [f"{source}: evidence must be a JSON array"]

    errors: list[str] = []
    for index, entry in enumerate(entries):
        prefix = f"{source}[{index}]"
        if not isinstance(entry, dict):
            errors.append(f"{prefix}: evidence entry must be an object")
            continue
        missing = REQUIRED_EVIDENCE_FIELDS - entry.keys()
        if missing:
            errors.append(f"{prefix}: missing fields: {', '.join(sorted(missing))}")
        claims = entry.get("claims")
        if not isinstance(claims, list) or not claims or not all(isinstance(claim, str) and claim.strip() for claim in claims):
            errors.append(f"{prefix}: claims must be a non-empty array of strings")
        parsed = urlparse(entry.get("url", "")) if isinstance(entry.get("url"), str) else None
        if not parsed or parsed.scheme not in {"http", "https"} or not parsed.netloc:
            errors.append(f"{prefix}: url must be an http(s) URL with a host")
        try:
            date.fromisoformat(entry["accessed"])
        except (KeyError, TypeError, ValueError):
            errors.append(f"{prefix}: accessed must be an ISO date")
    return errors


def main(root: Path = REPO_ROOT) -> int:
    root = root.resolve()
    markdown_files = {path.resolve() for path in root.glob("*.md")}
    markdown_files.update(path.resolve() for path in (root / "research").glob("**/*.md"))
    markdown_files.update(path.resolve() for path in (root / ".skills").glob("**/*.md"))
    markdown_files.update(path.resolve() for path in (root / ".github").glob("**/*.md"))
    markdown_files.update(path.resolve() for path in (root / "docs").glob("**/*.md"))
    evidence_files = {path.resolve() for path in (root / "research/docs/evidence").glob("*.json")}
    evidence_files.update(path.resolve() for path in (root / "docs/research/evidence").glob("*.json"))
    errors = [error for path in sorted(markdown_files) for error in check_markdown(path, root)]
    errors.extend(error for path in sorted(evidence_files) for error in check_evidence(path, root))
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
