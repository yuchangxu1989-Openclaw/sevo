# ADR-001 Use Event Sourcing for Pipeline State

## Decision
Use append-only event log (events.jsonl) as source of truth, with derived state.json for fast reads.
