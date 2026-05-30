# Product Requirements

## 产品愿景

SEVO is a pipeline governance framework for AI agent workflows.

## 范围

Covers spec → plan → implement → review lifecycle.

## FR-01 Router

The router classifies tasks by scope and determines pipeline level.

AC-01: Tasks with >500 lines trigger L2+ pipeline.
AC-02: Cross-domain tasks trigger L2+ pipeline.

## FR-02 Gate Engine

Gate engine evaluates stage completion against configurable rules.

AC-03: Gate must collect all reviewer verdicts before concluding.
AC-04: Rejected gate blocks pipeline advancement.
