# SEVO Healthcheck Standard

OpenClaw(主会话)

Date: 2026-05-31

## Purpose

`healthcheck-standard.md` is the single entrypoint for SEVO release-health verification. It unifies three evidence layers that were previously split across standalone scripts and browser walkthrough rules:

1. CLI smoke path — executed by `scripts/stranger-verify.sh`
2. Web browser walkthrough path — policy extracted from `workspace/skills/browser-stability-gates/SKILL.md`
3. Registry identity consistency path — executed by `workspace/scripts/registry-smoke.sh` when the project publishes registry artifacts

This standard defines when each layer must run, what it checks, what artifacts it must produce, and how pass/fail is judged.

## Trigger Matrix

| Trigger timing | Required layers | Notes |
| --- | --- | --- |
| Before release / publish | CLI smoke + Registry identity consistency + Web browser walkthrough (if project has Web UI) | Release is blocked by any required layer failure. |
| After PR merge | CLI smoke + Web browser walkthrough (if project has Web UI) | Used as change regression proof for the stranger path. |
| Scheduled巡检 | Registry identity consistency + Web browser walkthrough (if project has Web UI) | Focus on drift: package identity drift, browser drift, login/session drift. |

Rules:
- Pure CLI / backend / library projects may mark Web browser walkthrough as `skipped (no Web UI)`.
- Projects without published registry artifacts may mark Registry identity consistency as `skipped (not a registry release artifact)`.
- Any skip must include an explicit reason in the report.

## Layer 1 — CLI Smoke

### Source of truth
- Script: `scripts/stranger-verify.sh`
- Report path: `reports/stranger-verification-<date>.md`

### What it verifies
- Clean-environment install from npm registry
- `sevo --version` is runnable after install
- `sevo init` completes in an isolated workspace
- `sevo project create stranger-test` completes in the same isolated workspace
- `sevo doctor` completes and writes actionable health output

### Required execution protocol
- Run from a clean temporary directory and do not reuse maintainer state.
- Keep stdout/stderr redirected to a file, then read a tail summary.
- A non-zero script exit code is `FAIL`.

### Evidence requirements
- Report file at `reports/stranger-verification-<date>.md`
- Step table with pass/fail per command
- Temp directory disposition (`removed` or `kept`)
- Install source explicitly recorded as npm registry

### Pass / fail
- `PASS`: script exits `0`, report exists, and report status is `PASS`
- `FAIL`: any command step fails, report missing, or report status is `FAIL`

## Layer 2 — Web Browser Walkthrough

### Source of truth
- Policy source: `workspace/skills/browser-stability-gates/SKILL.md`
- Report path: `reports/<project>-verify.md` or `reports/<project>-smoke-test.md`
- Screenshot directory: `state/browser/screenshots/` or the path explicitly recorded by the verifier

### Mandatory core protocol

#### A. Preflight gates
Before any browser action, all checks must pass:
- CDP connectivity check: `curl http://127.0.0.1:9222/json/version`
- Correct browser profile for the target trust domain
- Login/session still valid on the target site

If any preflight gate fails, the walkthrough is `BLOCKED` and cannot be downgraded to a soft warning.

#### B. Runtime gates
Every browser step must obey all of the following:
- Wait for page ready state and key element visibility before acting
- Stop immediately on exception signal words, risk-control pages, captcha, or rate-limit pages
- Confirm result after each action before continuing
- Keep a human-like rhythm; action interval must not be lower than 1 second

#### C. Completion gates
The walkthrough must always output page evidence, even on failure:
- Current URL
- Page title
- Final status: `success`, `failed`, or `aborted`
- Failure class: `captcha`, `rate_limit`, `auth_expired`, `element_missing`, or `unknown`
- Last action and the step where execution stopped
- Screenshot path

### Screenshot verification
- At least one screenshot is mandatory for a passing Web walkthrough.
- Key screenshots should cover the core stranger path, not only the landing page.
- Missing screenshot evidence = `FAIL` even if the narrative says the flow passed.

### Pass / fail
- `PASS`: preflight passes, runtime walk completes the core user path, and screenshot evidence is attached
- `BLOCKED`: preflight fails before browser actions begin
- `FAIL`: runtime walk breaks, screenshot evidence is missing, or completion evidence is incomplete
- `SKIPPED`: only allowed when the project truly has no Web UI or no public/accessible browser target; report must say `skipped (no Web UI)` or `skipped (no public URL)`

## Layer 3 — Registry Identity Consistency

### Source of truth
- Script path: `/root/.openclaw/workspace/scripts/registry-smoke.sh`
- Report path: `/root/.openclaw/workspace/reports/registry-smoke-<date>.md`

### What it verifies
- Published package name matches the repository/package identity
- Registry package version matches the release being verified
- Install command and runtime entrypoints point at the same published artifact identity
- README / install instructions / package metadata do not drift across release channels

### Evidence requirements
- Registry smoke report with package name, version, and install source
- Comparison result between local release identity and registry-visible identity
- Explicit pass/fail status for each identity check

### Pass / fail
- `PASS`: package identity, version, install path, and public metadata are consistent
- `FAIL`: any identity mismatch, missing published artifact, or missing report file
- `SKIPPED`: only when the project does not publish registry artifacts; report must say `skipped (not a registry release artifact)`

### Current repo note
- The registry smoke script is owned at workspace level, not under `projects/sevo/scripts/`.
- It already verifies SEVO package identity against the npm registry and README-declared install/CLI identity.

## Unified Output Contract

A healthcheck run should produce or reference the following artifacts:
- CLI smoke report: `reports/stranger-verification-<date>.md`
- Web walkthrough report: `reports/<project>-verify.md` or `reports/<project>-smoke-test.md`
- Web screenshots: `state/browser/screenshots/<taskId>_<timestamp>.png` or equivalent recorded path
- Registry report: `/root/.openclaw/workspace/reports/registry-smoke-<date>.md`

Recommended healthcheck summary fields:
- `layer`: `cli-smoke` | `web-browser-walkthrough` | `registry-identity`
- `trigger`: `pre-release` | `post-merge` | `scheduled`
- `status`: `pass` | `fail` | `blocked` | `skipped`
- `reportPath`
- `screenshotPaths` (for Web)
- `checkedAt`
- `skipReason` (when applicable)

## Healthcheck Verdict Rules

- Overall `PASS`: every required layer for the trigger passes.
- Overall `BLOCKED`: any required Web layer is blocked by preflight failure.
- Overall `FAIL`: any required layer fails.
- Overall `SKIPPED`: never valid for the whole healthcheck; only individual optional layers may be skipped.

## Operator Notes

- The healthcheck stage should reference this document as mandatory guidance, instead of repeating browser and release checks in multiple prompts.
- Browser-specific procedures remain maintained in `workspace/skills/browser-stability-gates/SKILL.md`; this document only extracts the mandatory enforcement subset.
- Script ownership stays in `projects/sevo/scripts/stranger-verify.sh` and `/root/.openclaw/workspace/scripts/registry-smoke.sh`; this document defines orchestration policy, not script implementation.
