# FR-08a & FR-11 Architecture Design

## 1. Overview

This document describes the architecture for two SEVO features:
- **FR-08a Commercialization Gate**: Pre-deploy quality gate ensuring commercial readiness
- **FR-11 Proactive Clarification**: Cross-stage ambiguity detection and resolution mechanism

Both features are already substantially implemented. This document captures the design decisions and the remaining integration work (LLM-based semantic detection for FR-11).

---

## 2. FR-08a: Commercialization Gate

### 2.1 Position in Pipeline

```
... → Regression → [Commercialization Gate] → Deploy → Verify → Ledger
```

The gate activates when `publishTarget` is configured. It runs between the publish-generalization-gate stage and deploy, blocking release if checks fail.

### 2.2 Architecture

```
CommercializationGate (src/stages/commercialization-gate.ts)
├── Layer 1: Code Cleanliness
│   ├── checkHardcodedPaths()
│   ├── checkInternalReferences()
│   ├── checkConsoleResiduals() → consoleLogScanner
│   ├── checkTodoResiduals() → todoFixmeScanner
│   ├── checkConfigExternalization() → configExternalizationChecker
│   ├── checkSensitiveInfo()
│   └── checkDependencyCompleteness()
├── Layer 2: Package Integrity
│   ├── checkPackageJsonFields()
│   ├── checkEntryFileExists()
│   ├── checkTsconfigExists()
│   ├── checkGitignore()
│   └── checkNpmignore()
├── Layer 3: Documentation
│   ├── checkReadmeExists()
│   ├── checkReadmeQuality() → documentationQualityChecker
│   ├── checkConfigDocs()
│   ├── checkChangelog()
│   └── checkLicense()
├── Layer 4: Buildability (requiresExternalVerification=true)
│   ├── checkCleanBuild()
│   ├── checkTestPass()
│   └── checkCliHelp()
├── Layer 5: Out-of-Box
│   ├── checkNpmInstall()
│   ├── checkCorePathExists()
│   └── checkExternalDependencyGuide()
└── Layer 6: Error Handling
    └── checkErrorHandlingCoverage() → errorHandlingCoverageChecker
```

### 2.3 Key Design Decisions

1. **Incremental re-run (AC-4.32k)**: Each check is independent. The `layers` input parameter allows re-running only failed layers.
2. **External verification markers**: Layer 4 checks mark `requiresExternalVerification=true` because they require actual build/test execution (delegated to deploy-stage).
3. **Backward compatibility**: Legacy `PublishGateResult` type preserved via `legacyResult` field.
4. **Activation logic**: `CommercializationGate.shouldActivate()` is a static method checking `publishTarget` presence (AC-4.32a/AC-4.32e).
5. **Skip with audit trail**: User skip writes to ledger via `onSkip` callback (AC-4.32d).

### 2.4 Integration Points

- **Pipeline Engine**: Stage `publish-generalization-gate` maps to `CommercializationGate.execute()`
- **Scanners**: Reuses `src/scan/commercialization-scanners.ts` for deep code analysis
- **Artifact output**: Writes `commercialization-gate.json` to artifact base path

---

## 3. FR-11: Proactive Clarification

### 3.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  Clarification Subsystem                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐    ┌─────────────────────────────┐   │
│  │ AmbiguityDetector │    │ LlmSemanticAmbiguityDetector│   │
│  │ (structural rules)│    │ (semantic via callLlm)      │   │
│  └────────┬─────────┘    └──────────────┬──────────────┘   │
│           │                              │                   │
│           └──────────┬───────────────────┘                   │
│                      ▼                                       │
│         ┌────────────────────────┐                          │
│         │ ClarificationCoordinator│                          │
│         │ (lifecycle management)  │                          │
│         └────────────┬───────────┘                          │
│                      │                                       │
│         ┌────────────┼────────────┐                         │
│         ▼            ▼            ▼                          │
│  ┌────────────┐ ┌─────────┐ ┌──────────────┐              │
│  │DispatchToHost│ │ Resolve │ │ResolutionWriter│             │
│  │(via Adapter) │ │(response)│ │(write to sinks)│            │
│  └────────────┘ └─────────┘ └──────────────┘              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Two-Tier Detection Strategy

The spec requires semantic understanding (not keyword matching). The implementation uses a two-tier approach:

1. **Tier 1 - Structural Detection** (`AmbiguityDetector`): Catches obvious structural gaps (missing AC sections, undefined terms by pattern). These are legitimate structural checks, not semantic claims.

2. **Tier 2 - LLM Semantic Detection** (`LlmSemanticAmbiguityDetector`): Uses `SevoHostAdapter.callLlm()` to perform true semantic analysis of content for:
   - Vague requirements that appear complete but lack precision
   - Implicit assumptions not stated
   - Contradictions between spec and contract
   - Missing edge cases
   - Unstated dependencies

### 3.3 Stage Integration

Each stage (Spec, Contract, Implement) integrates clarification at:
- **Entry point**: Scan input artifacts for ambiguity before execution begins
- **Submission point**: Scan output artifacts before marking stage complete

The `ClarificationScanRule` interface allows stage-specific rules:
```typescript
interface ClarificationScanRule {
  id: string;
  evaluate(stageRecord: StageRecord, artifacts: ArtifactRef[]): ClarificationFinding[];
}
```

### 3.4 LLM Semantic Detector Design

```typescript
class LlmSemanticAmbiguityDetector {
  constructor(options: { adapter: SevoHostAdapter; stage: StageId })

  // Analyzes content using LLM for semantic ambiguity
  async detect(content: string, context?: DetectionContext): Promise<AmbiguitySignal[]>
}
```

The LLM detector:
- Receives the stage context (spec/contract/implement) to tailor its analysis
- Uses a structured prompt that asks the LLM to identify specific ambiguity types
- Returns `AmbiguitySignal[]` compatible with the existing pipeline
- Maps LLM findings to `ClarificationFinding` via the coordinator

### 3.5 Clarification Lifecycle

```
detect → open → dispatch → [wait] → resolve → applyResolution → settle
                                                      │
                                                      ▼
                                              ResolutionWriter
                                              (writes to sinks)
```

States: `open` → `resolved` → `settled` (or `expired` on timeout)

### 3.6 Resolution Sinks (AC-4.44)

| Knowledge Type | Sink | Target |
|---|---|---|
| correction | SPEC_PACKAGE | Spec artifact |
| decision | ADR | Architecture Decision Record |
| boundary | CONTRACT_PACKAGE | Contract artifact |
| methodology | METHODOLOGY | Methodology knowledge base |
| experience | EXPERIENCE | Experience knowledge base |
| meta | META | Meta knowledge base |

### 3.7 Blocking Semantics

- **BLOCKING**: Stage transitions to `clarification-blocked`, execution pauses
- **NON_BLOCKING**: Stage stays `active`, assumed default recorded, confirmation pending

---

## 4. Remaining Implementation Work

1. **LlmSemanticAmbiguityDetector**: New class in `src/clarification/` that uses `SevoHostAdapter.callLlm()` for semantic analysis
2. **Stage-specific scan rules**: Concrete `ClarificationScanRule` implementations for spec/contract/implement stages that combine structural + semantic detection
3. **Integration test**: Verify the full flow from detection through resolution writing

---

## 5. Module Dependencies

```
src/clarification/
├── ambiguity-detector.ts          (Tier 1: structural)
├── llm-semantic-detector.ts       (Tier 2: semantic) ← NEW
├── clarification-coordinator.ts   (lifecycle)
├── clarification-manager.ts       (question generation)
├── clarification-record.ts        (record type)
├── clarification-types.ts         (shared types)
├── resolution-writer.ts           (sink writing)
├── stage-scan-rules.ts            ← NEW (per-stage rules)
└── index.ts                       (public API)

src/stages/commercialization-gate.ts  (FR-08a, complete)
src/scan/commercialization-scanners.ts (supporting scanners)
```
