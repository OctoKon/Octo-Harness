# Repository baseline

Target: public `OctoKon/Splyce`, default branch `main`. Scope: repository controls available without purchasing an organization plan or paid security/quality product. A committed configuration is not proof of live enforcement; the delivery report records API read-back and CI results for the published revision.

## Applied repository settings

The repository API confirmed public visibility, squash merges enabled, merge commits and rebase merges disabled, branch deletion after merge, branch-update support, auto-merge availability, issues and discussions. Auto-merge availability does not approve or merge a pull request.

Secret scanning, secret push protection, Dependabot alerts/security updates, and private vulnerability reporting were enabled and checked through the repository API. Actions already enforced full action SHA pinning with GitHub-owned/verified actions allowed. Default workflow token permissions are read-only and Actions cannot approve pull requests. Organization membership and billing were not changed. Organization read-back confirmed the Free plan, read as the default repository permission, and mandatory two-factor authentication already enabled.

## Main protection policy

The reviewable policy is [.github/rulesets/main.json](../../../.github/rulesets/main.json). It requires one approval, a code-owner review, fresh approval after the last push, resolved review discussions, up-to-date passing `Documentation quality` and `Analyze Python` checks from the GitHub Actions application, and linear history. It blocks force pushes and branch deletion, allows squash merging only, and specifies no bypass actors. It was applied after the initial research/tooling bootstrap and verified through GitHub's rules API: active ruleset 25824256, no bypass actors, required pull-request/code-owner review and both named Actions checks. Subsequent work uses username-prefixed branches and PRs; no direct-main publication.

The [CODEOWNERS](../../../.github/CODEOWNERS) are the two verified repository administrators. Protection intentionally means future changes need another reviewer's approval; changing a ruleset as an administrator remains an explicit administrative action.

## Checks that exist now

| Control               | Actual scope                                                                                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation quality | Pinned Prettier, Markdown lint, local file/anchor links, evidence JSON, validator tests; PR dependency review rejects newly introduced moderate-or-higher findings in runtime/development/unknown scopes |
| CodeQL                | Security-extended analysis of the Python documentation validator and tests; PR/main/weekly/manual triggers                                                                                               |
| Dependabot            | Weekly grouped updates for npm documentation tools and GitHub Actions; security updates enabled                                                                                                          |
| Repository policy     | PR review, branch history/deletion/force-push restrictions, squash-only merge settings                                                                                                                   |

The runtime is not implemented. New source languages need their own formatter, lint/type/build/test checks and CodeQL configuration. A green documentation or Python analysis check says nothing about an unimplemented coding harness.

## GitHub Code Quality boundary

GitHub's separately named **Code Quality** product requires GitHub Team or Enterprise Cloud. Public visibility does not remove that prerequisite. It was not enabled and no paid plan or billing setting was changed. Free lint/format checks and CodeQL security analysis are distinct controls, not claims that this paid product is active. [GitHub enablement requirements](https://docs.github.com/en/code-security/how-tos/maintain-quality-code/enable-code-quality).

Public repositories can use branch protection on GitHub Free. [GitHub protected-branch availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches). CodeQL availability differs for private repositories; this repository was made public at the owner's explicit request. [GitHub CodeQL eligibility](https://docs.github.com/en/code-security/reference/code-scanning/troubleshoot-analysis-errors/private-repository-enablement).

## Known limits

The pinned Markdown toolchain currently reports four low-severity transitive dependency advisories with no offered nonbreaking update. It is development/CI tooling, installed with lifecycle scripts disabled; do not describe that as a clean dependency audit. Dependabot will surface available updates. Project-authored work uses [AGPL-3.0-only](../../../LICENSE), with retained third-party exceptions in [NOTICE.md](../../../NOTICE.md). Public visibility alone does not grant rights to copy third-party implementations.

Pages deployment is called as a reusable workflow only after the required documentation job succeeds on the same main revision; PRs do not deploy. Main workflow runs are not canceled during a valid deployment by a newer push. The PR-only dependency-review step is configured inside the required documentation job. A main-branch push does not exercise that PR event path. Public-repository eligibility is documented by [GitHub dependency review](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/reviewing-dependency-changes-in-a-pull-request). Partner-pattern validity and extended-metadata checks require Team/Enterprise with Secret Protection; they are not claimed as free enabled controls. [Supported secret patterns](https://docs.github.com/en/code-security/reference/secret-security/supported-secret-scanning-patterns).
