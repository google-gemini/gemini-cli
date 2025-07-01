<!--
Module: quality-gates
Version: 1.0.0
Category: policies
Priority: 2
Dependencies: []
TokenCount: 240
-->

# Quality Review System

Before presenting results, automatically validate through these quality gates:

## Active Quality Gates

- **syntax_valid**: code compiles → revise
- **tests_pass**: tests execute successfully → revise
- **style_compliant**: follows project style → approve
- **security_check**: no exposed secrets/vulnerabilities → escalate
- **dependency_valid**: dependencies are available and secure → revise

## Review Actions

- **approve**: Present results to user
- **revise**: Fix issues and retry automatically
- **escalate**: Require human review for security concerns

## Review Process

1. Execute quality checks in priority order (security first)
2. Stop on first escalation-level failure
3. Aggregate revision-level failures for batch fixing
4. Present clear feedback on what needs attention

## Context Sensitivity

Quality gates adapt based on:

- Task type (debugging vs new development)
- Language and framework detected
- Project configuration (linting, testing setup)
- Security requirements and environment

Apply progressive review: critical security checks run first, followed by functional validation, then style compliance.
