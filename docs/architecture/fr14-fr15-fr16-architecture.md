# FR-14 / FR-15 / FR-16 Architecture

## Overview

This document covers the architecture of three tightly coupled user-facing features:

- **FR-14** — Package Distribution & CLI (installation, initialization, command interface)
- **FR-15** — Progressive Disclosure (layered configuration and capability exposure)
- **FR-16** — Onboarding Experience (first-run demo and guided walkthrough)

These three FRs form the "user entry surface" of SEVO: how users install, discover, configure, and first experience the pipeline system.

---

## Module Map

```
src/cli/
├── index.ts              # Commander program setup, command registration
├── helpers.ts            # Shared CLI utilities (CONFIG_FILE, formatters)
├── cmd-init.ts           # sevo init — environment detection + config generation
├── cmd-demo.ts           # sevo demo — onboarding walkthrough (FR-16)
├── cmd-doctor.ts         # sevo doctor — health check
├── cmd-create.ts         # sevo project create
├── cmd-fr.ts             # sevo fr add/list
├── cmd-status.ts         # sevo status
├── cmd-show.ts           # sevo show (pipeline detail)
├── cmd-advance.ts        # sevo advance (manual stage push)
├── cmd-pause.ts          # sevo pause
├── cmd-resume.ts         # sevo resume
├── cmd-cancel.ts         # sevo cancel
├── cmd-ledger.ts         # sevo ledger
├── cmd-config.ts         # sevo config (L1 configuration)
├── cmd-scan.ts           # sevo scan (endgame / tiered)
├── cmd-gate.ts           # sevo gate (manual gate override)
├── cmd-verify.ts         # sevo verify
├── cmd-export.ts         # sevo export
├── cmd-goal.ts           # sevo goal (FR-18 OKR)
├── cmd-from.ts           # sevo from (import existing spec)
├── cmd-list.ts           # sevo list (projects)
├── demo-fixtures/
│   └── requirements.ts   # Built-in demo spec content
└── __tests__/            # Unit tests for CLI commands

src/progressive-disclosure/
├── index.ts              # Barrel export
├── cli-maturity.ts       # FR-15 CLI maturity detection + progressive help
├── default-config.ts     # L0/L1 config levels and defaults
├── custom-stage.ts       # L2 custom stage registry
├── sdk.ts                # L3 programmatic SDK
└── __tests__/            # Unit tests
```

---

## FR-14: Package Distribution & CLI

### Design Decisions

1. **Single package, triple entry point**: `dist/` (library API), `plugin/` (OpenClaw plugin), `bin/` (CLI). One npm install gives all three capabilities.

2. **Environment detection over configuration**: `sevo init` auto-detects the host adapter (OpenClaw vs standalone), Node version, package manager, CI providers, and project structure. Users don't manually specify these.

3. **Agent role inference by naming convention**: Rather than requiring explicit role mapping, `cmd-init.ts` uses regex patterns (`/^pm[-_]/i` → Product, `/^dev[-_]/i` → Coder, etc.) to auto-assign pipeline roles from agent IDs.

4. **Single-agent degradation**: When only one agent is detected, all role pools are filled with that single agent ID. The pipeline remains functionally complete — every stage executes, just with the same agent wearing all hats.

5. **Project discovery via filesystem**: The plugin scans `projects/*/sevo.json` at startup. A project is managed if its `sevo.json` contains `{"managed": true}`. No global registry editing required to add projects.

### Key Components

| Component | Responsibility |
|-----------|---------------|
| `cmd-init.ts::inspectEnvironment()` | Detects adapter, tools, project profile |
| `cmd-init.ts::detectAvailableAgentIds()` | Reads openclaw.json to find agent pool |
| `cmd-init.ts::inferRoleFromAgentId()` | Pattern-matches agent IDs to pipeline roles |
| `cmd-init.ts::generateDefaultRoleAssignment()` | Builds role→agent mapping (multi or single-agent) |
| `cmd-doctor.ts` | Post-init health check with actionable fix suggestions |

### CLI Command Taxonomy

| Category | Commands | Purpose |
|----------|----------|---------|
| Setup | init, doctor, demo | Installation and verification |
| Project | create, list, from | Project lifecycle |
| Pipeline | fr, status, show, advance | Pipeline operations |
| Control | pause, resume, cancel | Lifecycle management |
| Audit | ledger, scan, verify, gate | Quality and compliance |
| Config | config, export, goal | Configuration and goals |

---

## FR-15: Progressive Disclosure

### Layered Model

```
L0 ─ Install & Use (zero config)
 │   sevo init → sevo project create → sevo fr add → pipeline runs
 │
L1 ─ Configure (edit sevo.config.json)
 │   Thresholds, gate strictness, notification, compliance mode
 │
L2 ─ Customize (custom stages + gate rules)
 │   CustomStageRegistry: insert stages before/after anchors
 │
L3 ─ Program (SevoSDK API)
     createPipeline(), advanceStage(), completeStage(), classifyAction()
```

### CLI Maturity Detection

`cli-maturity.ts` implements progressive help output:

1. **Detect usage signals**: Check for `sevo.json` existence, pipeline count, advanced command usage count.
2. **Classify maturity**: `new` → `basic` → `advanced` based on thresholds.
3. **Filter help output**: New users see only core commands (init, demo, doctor, create, list, status). Basic users unlock operational commands. Advanced users see everything.
4. **All commands remain executable**: Progressive disclosure only affects `--help` output, never blocks execution. Scripts and power users are never gated.

### Config Level Visibility

`default-config.ts` defines three config key groups:

- **basic**: projectName, adapter, stages, rules, notification, pdcaCheck, roleAssignment
- **advanced**: customStages, customGateRules, stageOrder, evaluators, clarification, compliance
- **expert**: sdk, customAdapter, customExecutor, apiKeys, llm, hooks, isolation

`getKeysForLevel()` returns cumulative keys (expert includes all basic + advanced keys).

### Custom Stage Registry (L2)

`CustomStageRegistry` allows runtime stage insertion:

- Validates no collision with built-in stage IDs
- Validates anchor stage exists
- Supports `before` / `after` positioning
- Attaches optional custom gate rules per stage
- Thread-safe in-memory registry (no persistence — config-driven on restart)

### SDK (L3)

`SevoSDK` wraps `PipelineEngineFacade` + `CustomStageRegistry`:

- `createPipeline()` / `advanceStage()` / `completeStage()` — full lifecycle control
- `pause()` / `resume()` / `cancel()` — state management
- `registerCustomStage()` — L2 bridge from code
- `classifyAction()` — AC-15.7 action risk classification (L0/L1/L2)

### Action Level Classification (AC-15.7)

Operations are classified into three risk tiers:

| Level | Behavior | Examples |
|-------|----------|---------|
| L0 | Execute silently | File read/write, build, test, code generation |
| L1 | Execute then notify | Config change, dependency install, branch creation |
| L2 | Confirm before execute | Publish, delete, external comms, production changes |

Custom `actionLevels` in `sevo.config.json` override defaults.

---

## FR-16: Onboarding Experience

### Demo Flow

`sevo demo` creates a temporary project and walks through a simplified pipeline:

```
Banner → Create Pipeline → Spec + OKR → Gate → Implement → Review → Smoke Test → Deploy → Summary
```

### Two Modes

| Mode | Flag | Requirements | Purpose |
|------|------|-------------|---------|
| Dry-run | `--dry-run` | None (no LLM, no network) | Verify installation, show artifact structure |
| Full | (default) | LLM available | Run real L0 pipeline with built-in example project |

### Key Design Choices

1. **Self-contained**: Demo uses a temp directory, never touches user's real projects.
2. **Artifact production**: Even dry-run produces real files (specs, contracts, reports, gate results) so users can inspect the output structure.
3. **FR-18 integration**: Demo showcases OKR decomposition and FR→KR traceability as part of the walkthrough.
4. **Post-demo guidance**: After completion, outputs "what you just saw" explanation + "next steps with your own project" instructions.
5. **Timing**: Designed to complete within 5 minutes (AC-16.1).
6. **`--create-after` flag**: Optionally creates a real project after demo completes, bridging onboarding into actual usage.

### Demo Fixtures

`demo-fixtures/requirements.ts` contains a built-in product requirements markdown document used as the demo spec input. This ensures the demo is reproducible and doesn't depend on external content.

---

## Cross-Cutting Concerns

### Error Handling

All CLI commands follow a consistent pattern:
- Actionable error messages (tell user what to do, not just what failed)
- Exit codes: 0 = success, 1 = user error, 2 = system error
- `sevo doctor` as the universal "something's wrong" entry point

### Testability

- `runDemo()` accepts a `log` callback and returns structured `DemoResult` — fully testable without TTY
- `inspectEnvironment()` returns a pure data structure, no side effects
- `CustomStageRegistry` is stateless per instance — no global singletons

### Standalone vs OpenClaw

The CLI works in two modes:
- **OpenClaw adapter**: Full pipeline execution with agent dispatch, plugin hooks, LLM gates
- **Standalone adapter**: Local-only execution, manual stage advancement, no agent dispatch

Detection is automatic via `inspectEnvironment()`. The adapter choice propagates through config into the engine layer.
