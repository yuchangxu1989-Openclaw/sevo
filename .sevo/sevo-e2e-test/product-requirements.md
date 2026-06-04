# SEVO E2E Test Product Requirements

OpenClaw(主会话) 2026-06-03

## 1. Goal

Create a minimal but meaningful SEVO end-to-end validation feature: when a SEVO pipeline reaches completion, the plugin records that completion in `state/pipeline-completion-log.json`.

This project exists to verify the full SEVO automation loop on a small production-shaped change: spec → implementation → independent audit. The feature is intentionally narrow so failures expose pipeline orchestration issues instead of being hidden inside a large product scope.

## 2. Why

SEVO claims to manage a complete automated development lifecycle. That claim needs an end-to-end test project that produces a durable, inspectable artifact when a pipeline finishes.

A completion log is useful because:

1. It gives operators a stable file-based signal that a pipeline actually reached terminal completion.
2. It supports later audit, debugging, and regression checks without reading transient session output.
3. It validates append-only state mutation, one of the core behaviors needed for reliable automation.

## 3. Scope

### In scope

- Add pipeline completion logging to the SEVO plugin/runtime path that marks a pipeline completed.
- Persist completion records to `state/pipeline-completion-log.json`.
- Store each completion as one JSON object inside a JSON array.
- Append new records without overwriting previous completion records.
- Include the completed pipeline project slug, completion timestamp, and completed stages.

### Out of scope

- No UI changes.
- No external notification delivery.
- No database schema changes.
- No changes to `openclaw.json`.
- No log rotation, pruning, export, or analytics.
- No modification of incomplete/failed/blocked pipeline handling beyond ensuring those states do not create completion records.

## 4. Functional Requirements

### FR-1: Pipeline completion log

When a SEVO pipeline reaches the completed terminal state, SEVO must append a completion record to `state/pipeline-completion-log.json`.

The completion record provides durable evidence that the pipeline finished, which allows the SEVO E2E test to verify the automation loop without depending on stdout, chat history, or volatile process state.

#### Acceptance criteria

- **AC-1.1: Completion record fields**
  - Each completion record must include:
    - `projectSlug`: the completed pipeline's project slug.
    - `completedAt`: an ISO-8601 timestamp string generated at completion time.
    - `stages`: an array listing the stages in the completed pipeline.
  - Verification standard: after completing a test pipeline, parse `state/pipeline-completion-log.json` and confirm the newest record has all three fields, `completedAt` parses as a valid ISO timestamp, and `stages` is an array.

- **AC-1.2: Completion log path**
  - The completion log file path must be exactly `state/pipeline-completion-log.json`, relative to the SEVO project/runtime root used by the plugin.
  - Verification standard: no alternative completion-log file is required for this feature; the expected file must exist at `state/pipeline-completion-log.json` after a pipeline completes.

- **AC-1.3: Append-only JSON array**
  - The log file must contain a JSON array.
  - If the file already contains records, completing another pipeline must append one new record and preserve existing records in order.
  - Verification standard: seed the file with an existing valid JSON array, complete a pipeline, parse the file, and confirm the previous records remain and the array length increases by exactly one.

## 5. Boundaries and invariants

- Completion logging must happen only for completed pipelines.
- Failed, blocked, paused, cancelled, or in-progress pipelines must not create completion records.
- The log writer must preserve valid JSON. A partial write or malformed existing file must not be silently treated as success.
- The implementation must not overwrite unrelated files under `state/`.
- The implementation must not change existing pipeline stage ordering or completion semantics.

## 6. Verification plan

1. Unit-level behavior: exercise the completion logging path with an existing log file and verify append-only JSON array behavior.
2. Edge behavior: verify a missing log file is created as a JSON array with one record.
3. Negative behavior: verify non-completed pipeline states do not append records.
4. E2E behavior: run a minimal pipeline through completion and confirm `state/pipeline-completion-log.json` contains the expected newest record for that `projectSlug`.

## 7. Success criteria

This project is complete when:

- `state/pipeline-completion-log.json` is created on pipeline completion if absent.
- Existing completion records are preserved.
- Each appended record contains `projectSlug`, `completedAt`, and `stages`.
- The log remains valid JSON after repeated completions.
- The change passes implementation review and independent audit in the SEVO pipeline.
