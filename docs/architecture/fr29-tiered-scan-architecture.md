# FR-29 Tiered Endgame Gap Scan — Architecture Design

## Overview

FR-29 implements a three-layer verification system that progressively deepens validation from file-level coverage (L1) through AC-level semantic analysis (L2) to runtime liveness verification (L3). Each layer gates the next — L2 only runs if L1 passes, L3 only runs if L2 passes.

## Module Structure

```
src/scan/
├── index.ts                      # Public API exports
├── types.ts                      # Shared type definitions
├── l1-file-scanner.ts            # L1: File-level coverage check
├── l2-ac-semantic-scanner.ts     # L2: Three-phase AC semantic pipeline
├── code-map-generator.ts         # L2 Phase 1: Static code map extraction
├── l3-runtime-verifier.ts        # L3: Runtime liveness + AC verification
├── default-runtime-checks.ts     # L3: Default check generation per project type
├── llm-semantic-verifier.ts      # Shared LLM verification utilities
├── tiered-scan-orchestrator.ts   # Orchestrates L1→L2→L3 with gating
├── scan-mapping.ts               # FR→file mapping persistence
├── scan-report.ts                # Report generation and serialization
├── commercialization-scanners.ts # FR-08a commercialization checks
├── utils.ts                      # JSON/text utilities
└── __tests__/                    # Unit tests (32 passing)
```

## L1 File-Level Scanner

**Responsibility**: Confirm every FR has corresponding code, compilation passes, tests pass.

- Parses spec to extract FR list
- Checks FR→file mapping (convention-based or explicit `frFileMap`)
- Runs compile command (`tsc --noEmit`)
- Runs test command (`npm test`)
- Produces `gap-scan-l1.json`

**Trigger**: After every `implement` stage completion.

## L2 AC Semantic Scanner (Three-Phase Pipeline)

**Responsibility**: Verify each AC has implementation code using LLM semantic analysis.

### Phase 1: Code Map Generation (Zero LLM)
- `CodeMapGenerator` traverses configured `scanDirs`
- Extracts: relative path, exported symbols, file header comments
- Produces compact text (~100-200 chars/file)
- Pure static analysis, deterministic, zero token cost

### Phase 2: Batch Triage (1-N LLM calls)
- Combines AC list + code map into batched prompts
- `batchSize` default 150 ACs per LLM call
- LLM classifies each AC: `covered` / `suspect` / `uncovered`
- Tags candidate implementation files

### Phase 3: Precise Verification (suspect/uncovered only)
- Reads actual source code of candidate files
- LLM judges final status with confidence score
- Low confidence (<0.7) → `needs-review`

**Token efficiency**: O(batches + suspects) vs O(AC count). ~99% reduction.

**Trigger**: Endgame pre-release, or standalone via `sevo scan --level 2`.

## L3 Runtime Verifier

**Responsibility**: Execute functionality in real environment, verify meaningful output.

- Supports project types: `cli`, `web`, `library`, `hook/plugin`
- Executes configured checks (or auto-generates defaults from package.json)
- LLM judges whether output is "meaningful" (not empty/placeholder/error)
- When `specPath` provided: parses ACs, cross-references L2 results, LLM verifies each AC against runtime output

**Trigger**: Post `npm publish`, or after user-facing implement completion.

## Pipeline Integration

| Layer | Integration Point | Mechanism |
|-------|------------------|-----------|
| L1 | `review` stage | Extended ImplementationReviewGate |
| L2 | `endgame` pre-release | ACCoverageGate (L1 must pass first) |
| L3 | `post-release-validation` | PostReleaseValidationStage.execute() |

`TieredScanOrchestrator.run()` coordinates all three with automatic gating logic.

## CLI Interface

```bash
sevo scan --level 1|2|3|all [--spec <path>] [--source <dir>] [--output <path>]
sevo scan --level 3 --project-type cli --command "sevo --help"
sevo scan --commercialization  # FR-08a checks
```

## Key Design Decisions

1. **Three-phase L2 over per-AC calls**: Reduces token cost 99%+ while maintaining semantic accuracy
2. **Gating between layers**: L2 skipped if L1 fails (no point checking ACs if code doesn't compile)
3. **LLM for meaningfulness**: Static checks can't judge "meaningful output" — LLM semantic evaluation required
4. **Configurable scan scope**: `scanDirs`, `extensions`, `ignoreDirs` prevent scanning irrelevant files
5. **Project-type polymorphism**: L3 adapts verification strategy (CLI exec, HTTP fetch, module import, hook trigger) based on project type
