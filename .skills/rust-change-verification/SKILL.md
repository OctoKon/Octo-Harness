---
name: rust-change-verification
description: Verify a Rust behavior change after the affected code and callers are known. Use when a Rust change alters observable behavior, error handling, parsing, persistence, concurrency, or a public interface; do not use for prose-only edits.
---

# Rust change verification

Use the smallest checks that exercise the changed behavior on its real boundary.

1. Identify the crate, affected callers, feature flags, examples or binaries, and existing tests. Add one focused regression or integration test only when the changed behavior is non-trivial and lacks coverage. The test must fail if the behavior is removed; do not mock the system under test.
2. Format the affected crate with `cargo fmt --check`. Run the narrow test target first, then the required crate or workspace test scope. `cargo test` also executes documentation tests by default; use targeted options only when they match the project’s existing convention.
3. Run `cargo clippy` for the affected package with its established feature/profile settings. Treat a new warning in changed code as a finding, not a reason to relax lints.
4. If compilation, tests, or Clippy cannot run, report the exact command, failure and which behavior remains unverified. Do not infer a pass from a build, type check, schema, or diff.

Record commands and observed results against the final revision. Broaden to workspace checks only when shared interfaces, workspace configuration, or the project’s required checks make that necessary.
