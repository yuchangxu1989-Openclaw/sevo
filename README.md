# SEVO

> SEVO is a spec-to-release pipeline for AI coding agents that turns vague requests into reviewed, user-verifiable delivery.

[![npm version](https://img.shields.io/npm/v/sevo-pipeline)](https://www.npmjs.com/package/sevo-pipeline)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/yuchangxu1989-Openclaw/sevo/blob/main/LICENSE)
[![Tests: 1351 passing](https://img.shields.io/badge/tests-1351%20passing-brightgreen.svg)](./tests)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-339933.svg)](https://nodejs.org/)

Ship agent-generated changes with specs, gates, audits, and release proof.

🌐 [Website](https://agentos.site/sevo.html)

SEVO gives AI coding agents a delivery process instead of a prompt-only loop. It moves work through scoped requirements, locked plans, implementation, independent audit, and release checks so the output can be defended after it ships.

## Quick Start

1. **Install**

   ```bash
   npm install sevo-pipeline
   ```

   Adds SEVO to the current project so `npx sevo` can run the bundled CLI.

2. **Initialize**

   ```bash
   npx sevo init
   ```

   Checks the workspace, detects the runtime, and prepares the project for a managed pipeline.

3. **Create a pipeline**

   ```bash
   npx sevo create my-project
   ```

   Creates the project skeleton and the first pipeline state for `my-project`.

## Architecture Overview

SEVO runs a fixed delivery loop: **Specify → Plan → Implement → Audit → Publish**.

- **Specify** turns a loose request into a scoped spec with success criteria, boundaries, and artifacts.
- **Plan** locks the architecture, interfaces, and acceptance path before code starts.
- **Implement** executes the approved plan and advances the pipeline with concrete code and evidence.
- **Audit** sends the result through an independent review step so the writer does not grade its own work.
- **Publish** verifies release readiness, closes remaining delivery gaps, and records the final ledger.

Every stage transition passes an LLM-driven quality gate, so missing evidence, weak handoffs, and scope drift are blocked before the pipeline moves forward.

---

## Mainline Delivery Pipeline

```
Specify → Spec Review Gate → ┬─ Test Case Authoring (parallel)
                              ├─ UX Acceptance Authoring (parallel)
                              ├─ Commercial Acceptance Authoring (parallel)
                              └─ Architecture Contract (parallel)
                                       ↓
                                 Architecture Review Gate
                                       ↓
Implement → Independent Audit → Smoke Test → ┬─ UX Acceptance (parallel)
                                             └─ Commercial Review (parallel)
                                                      ↓
                         Regression → Commercialization Gate → Deploy → Final Verification
                                                      ↓
                 Final Delivery (README sync + version decision + publish + GitHub push + gap scan)
                                                      ↓
                                              Delivery Ledger
```

Every node has a gate. Test case authoring, UX acceptance authoring, commercial acceptance authoring, and the architecture contract run in parallel after spec review; they are supporting artifacts, not extra baseline stages in `pipeline-engine`. Conditional stages are not counted as mandatory work. When review finds a defect, SEVO creates a targeted fix task, queues it by priority, and sends the result back to the right reviewer. The convergence loop runs up to three rounds before escalating for human intervention. Before implementation starts, the L2 injection reminds the agent to confirm spec state so code never outruns the approved contract.

---

## Goal Management: OKR → SMART → PDCA

SEVO pushes delivery from "done" to "proven correct" with three connected control loops.

**SMART goal statements**
During Specify, every functional requirement gets a verifiable SMART goal: specific, measurable, and time-bounded. If the goal is vague, the pipeline does not advance.

**PDCA runtime checks**
Declare each feature's SMART goal and liveness probe in JSON. A probe can be an HTTP endpoint, a CLI command, or a required file. The PDCA engine runs Plan-Do-Check-Act checks against the live system, proving that the feature works at runtime instead of merely existing in code.

**OKR convergence checks**
Attach a final objective and KR tree to the pipeline. SEVO checks KR progress on schedule; missed KRs generate SMART decomposition suggestions for the orchestration layer, and the pipeline is marked converged only when every KR is satisfied.

**Liveness release gate**
Publish runs the configured liveness probes. A P0 probe failure blocks release, catching the dangerous case where the build passes but the product is unusable.

---

## Role-Aware Dispatch

SEVO routes product work to product roles, code work to development roles, and review work to audit roles. The pipeline keeps requirement definition, implementation, and independent judgment separate so one agent does not both create and grade the same deliverable. If a task is aimed at the wrong role, SEVO redirects it before work starts.

---

## Intelligent Routing

SEVO classifies incoming work before it chooses the path:

- **Tiny changes** skip spec and contract, enter implementation directly, and still close the smallest safe delivery loop.
- **Single-domain changes** start at spec, may use a lighter contract, and keep the gates.
- **New systems and cross-domain refactors** run the full mainline with every gate.

Pipelines can start from any valid stage. A hotfix can enter at implementation; an architecture change can enter at planning. Use `sevo:create <project> --from <stage>` to choose the entry point. Valid stages are `specify`, `plan`, `implement`, `audit`, and `deploy`; the default is `specify`.

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `sevo init` | Initialize the workspace, detect OpenClaw, register the plugin, and assign roles. |
| `sevo doctor` | Check configuration completeness and environment readiness. Run this first when setup looks wrong. |
| `sevo project create <slug>` | Create a project and its pipeline state. |
| `sevo:create <project> --from <stage>` | Create a pipeline from a specific stage; stage can be `specify`, `plan`, `implement`, `audit`, or `deploy`. |
| `sevo fr add <project> <desc>` | Add a functional requirement and trigger the pipeline. |
| `sevo fr list <project>` | List every functional requirement for the project and its current state. |
| `sevo status [id]` | Show pipeline status. |
| `sevo advance <id>` | Advance a pipeline manually. |
| `sevo show <id>` | Show pipeline details. |
| `sevo list` | List all projects and pipelines. |
| `sevo pause <id>` | Pause a pipeline. |
| `sevo resume <id>` | Resume a paused pipeline. |
| `sevo cancel <id>` | Cancel a pipeline. |
| `sevo ledger <id>` | Show the delivery ledger. |
| `sevo export [id]` | Export pipeline data. |
| `sevo config` | View or update configuration. |
| `sevo demo` | Run the interactive demo. |
| `sevo goal create` | Create an OKR goal. |
| `sevo goal pdca` | Run PDCA checks. |

---

## Runtime and Verification Details

- L1 verification runs through `scripts/verify-l1.sh`, which owns environment checks and command orchestration.
- Stranger-ready release verification runs with `scripts/stranger-verify.sh > /tmp/sevo-stranger-verify.txt`; reports are written to `reports/stranger-verification-<date>.md`.
- The website landing page does not hard-code server IPs. Product links come from `NEXT_PUBLIC_KIVO_URL`, `NEXT_PUBLIC_SEVO_URL`, and `NEXT_PUBLIC_CLAW_DESIGN_URL`, with same-origin fallbacks when those variables are unset.
- `role-templates.js` injects Think Before Coding and Goal-Driven Execution into coding task templates, reducing premature implementation and unverifiable completion claims.

---

## Use Cases

**Solo builders using AI as the development team**
You stay in the product operator seat while agents write most of the code. SEVO keeps every change tied to a goal, a boundary, and delivery evidence. The final delivery engine handles version decisions, multi-platform publishing, and gap scans so users do not install something that only worked in the agent's transcript.

**Multi-agent product teams**
Several agents can work in parallel without sharing one blurry prompt. SEVO assigns roles, sequences stages, requires independent audit, and advances the pipeline when evidence is present.

**From runnable code to usable product**
Passing code is not the same as delivered value. SEVO's post-implementation checks compare every promised capability against concrete artifacts and runtime proof, so a new user can install the package and reach the product's value without inside knowledge.

---

## Documentation

- [GitHub](https://github.com/yuchangxu1989-Openclaw/sevo)
- [npm](https://www.npmjs.com/package/sevo-pipeline)

## License

MIT
