# FR-22 Role-Task Dispatch Constraint — Architecture Design

## Overview

FR-22 enforces role-based access control on pipeline stage dispatch. Each stage declares a required role; before dispatching work to an agent, the system validates the agent's role matches the stage requirement. Mismatches produce audit events and either block (multi-agent) or warn (single-agent).

## Module Structure

```
src/role-registry/
├── index.ts                  # Public API exports
├── role-registry.ts          # Role resolution (config + naming convention)
├── role-stage-validator.ts   # Stage dispatch validation + audit events
├── role-task-matcher.ts      # Facade: match + assert + dispatch matrix
└── __tests__/
    └── role-task-matcher.test.ts
```

## Components

### RoleRegistry

**Responsibility**: Resolve an agent's role from dual sources.

1. **Explicit config** (highest priority): `agentRoles: { "pm-01": "Product" }`
2. **Naming convention**: Pattern-based inference (`/^pm[-_]/i` → Product, `/^audit[-_]/i` → Auditor)

Roles: `Product | UX | Architect | Coder | Auditor | Any`

Custom naming patterns can be added via config, prepended to defaults for priority.

### RoleStageValidator

**Responsibility**: Enforce role requirements per pipeline stage.

Default stage→role mapping (AC-22.1):
- `spec`, `spec-review-gate`, `commercial-acceptance-authoring`, `pm-commercial-review` → Product
- `ux-acceptance-authoring`, `ux-acceptance` → UX
- `contract`, `contract-review-gate` → Architect
- `implement`, `smoke-test`, `test-case-authoring` → Coder
- `review`, `regression` → Auditor
- `deploy`, `verify`, `post-release-validation`, `ledger` → Any

Behavior on mismatch:
- **Multi-agent mode** (AC-22.4): Block dispatch, throw `RoleDispatchBlockedError`
- **Single-agent mode** (AC-22.5): Allow with warning, audit event action = `warned`

Stage roles are fully configurable (AC-22.7).

### RoleTaskMatcher (Facade)

**Responsibility**: Single entry point for role-task validation.

- `match(request)`: Returns full validation result with mismatch event
- `assertAllowed(request)`: Throws on block
- `validateDispatchMatrix(agentIds)`: Generates complete stage×agent matrix for CI/doctor

### RoleMismatchEvent (AC-22.3)

```typescript
{
  timestamp: string;
  agentId: string;
  stage: StageId;
  requiredRole: PipelineRole;
  actualRole: PipelineRole | null;
  action: 'blocked' | 'warning';
  reason: string;
}
```

## Pipeline Integration

Integration point: `PluginAdapter.validateStageDispatch()` (src/plugin-adapter/plugin-adapter.ts)

Flow:
1. Plugin adapter receives stage execution request
2. Reads project config for `roleAssignment` settings
3. Constructs `RoleTaskMatcher` with config
4. Calls `matcher.match()` for the target agent + stage
5. On mismatch: appends audit event to `dispatch-audit.jsonl`
6. Multi-agent + blocked → throws `RoleDispatchBlockedError` (stage not dispatched)
7. Single-agent + warned → proceeds with warning logged

## Configuration (sevo.config.json)

```json
{
  "roleAssignment": {
    "agentRoles": { "pm-01": "Product", "dev-01": "Coder" },
    "namingPatterns": [{ "pattern": "^my-custom-", "role": "Architect" }],
    "stageRoles": { "implement": "Coder", "review": "Auditor" }
  }
}
```

## `sevo init` Integration (AC-22.6, AC-22.8)

During `sevo init`:
1. Scans available agents (from OpenClaw config or host adapter)
2. Infers roles via naming convention
3. Generates role assignment table in project config
4. User can confirm or override

## Key Design Decisions

1. **Dual-source resolution**: Explicit config takes priority over naming convention — supports any agent naming scheme
2. **Single-agent degradation**: Doesn't block solo developers; logs warning for audit trail
3. **Separation from stage runner**: Validation happens in plugin-adapter before dispatch, not inside stage execution — clean separation of concerns
4. **Configurable stage roles**: Users can reassign roles to stages for custom workflows
5. **No binding to specific agent names**: Works with any agent pool composition — role resolution is pattern-based and config-driven
