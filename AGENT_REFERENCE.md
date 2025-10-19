# Complete 96-Agent Reference Guide

## Quick Reference by Category

### Management (2 agents)
- **coordinator** - Pure manager, never does direct work, only coordinates other agents
- **verifier** - Final cross-verification and quality assurance

### Planning (2 agents)
- **planner-1** - Strategic planning and architecture design
- **planner-2** - Alternative planning for complex task breakdown

### Analysis & Research (5 agents)
- **analyzer-1** ⭐ MANDATORY - Requirements analysis and clarification
- **analyzer-2** - Deep analysis and research
- **researcher-1** - Information gathering and research
- **researcher-2** - Alternative research approaches
- **researcher-3** - Fact-checking and verification research

### Code Generation (8 agents)
- **coder-1** - Primary code generation
- **coder-2** - Backend and API development
- **coder-3** - Frontend and UI code
- **coder-4** - Advanced algorithmic code
- **coder-5** - Complex system integration
- **coder-6** - Data processing and analytics
- **coder-7** - Infrastructure as code
- **coder-8** - Specialized domain code

### Testing & QA (6 agents)
- **tester-1** - Unit testing
- **tester-2** - Integration testing
- **tester-3** - End-to-end testing
- **qa-1** - Quality assurance review
- **qa-2** - Acceptance testing
- **qa-3** - Regression testing

### Debugging (3 agents)
- **debugger-1** - Bug diagnosis
- **debugger-2** - Root cause analysis
- **debugger-3** - Performance debugging

### Review & Refactoring (5 agents)
- **reviewer-1** - Code review
- **reviewer-2** - Architecture review
- **reviewer-3** - Security review
- **refactorer-1** - Code refactoring
- **refactorer-2** - Performance refactoring

### Optimization (3 agents)
- **optimizer-1** - Performance optimization
- **optimizer-2** - Memory optimization
- **optimizer-3** - Algorithm optimization

### Documentation (3 agents)
- **documenter-1** - API documentation
- **documenter-2** - User documentation
- **documenter-3** - Technical documentation

### Architecture & Security (6 agents)
- **architect-1** - System architecture design
- **architect-2** - Microservices architecture
- **architect-3** - Cloud architecture
- **security-1** - Security analysis
- **security-2** - Vulnerability assessment
- **security-3** - Security hardening

### DevOps & Infrastructure (3 agents)
- **devops-1** - CI/CD pipelines
- **devops-2** - Container orchestration
- **devops-3** - Infrastructure automation

### Database (3 agents)
- **database-1** - Schema design
- **database-2** - Query optimization
- **database-3** - Database migrations

### API Development (3 agents)
- **api-1** - REST API design
- **api-2** - GraphQL API design
- **api-3** - API integration

### Frontend & UX (6 agents)
- **frontend-1** - React/Vue development
- **frontend-2** - State management
- **frontend-3** - Component libraries
- **ux-1** - User experience design
- **ux-2** - Accessibility design
- **ux-3** - Interaction design

### Performance (3 agents)
- **performance-1** - Load testing
- **performance-2** - Performance profiling
- **performance-3** - Optimization strategies

### Data & ML (5 agents)
- **data-engineer-1** - Data pipeline design
- **data-engineer-2** - ETL processes
- **ml-engineer-1** - Machine learning models
- **ai-specialist-1** - AI/ML architecture
- **ai-specialist-2** - Model training and optimization

### Validation & Error Handling (4 agents)
- **validator-1** ⭐ MANDATORY - Input validation
- **validator-2** ⭐ MANDATORY - Output validation
- **error-handler-1** ⭐ MANDATORY - Error handling enforcement
- **error-handler-2** - Error recovery strategies

### Formatting & Linting (4 agents)
- **formatter-1** ⭐ MANDATORY - Code formatting
- **formatter-2** - Documentation formatting
- **linter-1** ⭐ MANDATORY - Code linting
- **linter-2** - Style enforcement

### Configuration & Dependencies (4 agents)
- **config-1** - Configuration management
- **config-2** - Environment setup
- **dependencies-1** - Dependency management
- **dependencies-2** - Package updates

### Monitoring & Compliance (5 agents)
- **monitoring-1** - Application monitoring
- **monitoring-2** - Log aggregation
- **monitoring-3** - Alerting systems
- **compliance-1** - Regulatory compliance
- **compliance-2** - Standards compliance

### Accessibility & Internationalization (4 agents)
- **accessibility-1** - WCAG compliance
- **accessibility-2** - Screen reader optimization
- **i18n-1** - Internationalization
- **i18n-2** - Localization

### Backup & Migration (4 agents)
- **backup-1** - Backup strategies
- **backup-2** - Disaster recovery
- **migration-1** - Data migration
- **migration-2** - System migration

### Caching & Blockchain (4 agents)
- **cache-1** - Caching strategies
- **cache-2** - Cache invalidation
- **blockchain-1** - Smart contract development
- **blockchain-2** - Blockchain integration

### Integration (1 agent)
- **integrator** ⭐ MANDATORY - Final integration and assembly

---

## Mandatory Agents (8 Required for Every Task)

These agents MUST run for ALL tasks to ensure baseline quality:

1. **analyzer-1** - Requirements analysis and clarification
2. **validator-1** - Input validation
3. **validator-2** - Output validation
4. **formatter-1** - Code formatting
5. **error-handler-1** - Error handling enforcement
6. **linter-1** - Code linting
7. **verifier** - Final cross-verification
8. **integrator** - Final integration and assembly

---

## Agent Temperatures

- **0.2** (Lowest - Most deterministic): Validators, lingers, security, compliance, backup
- **0.3** (Default): Coders, architects, devops, database, API
- **0.4** (Higher - More creative): Planners, documenters, UX designers

---

## Model Configuration

All agents use: **gemini-2.5-pro**

No fallback models. Strict enforcement ensures 100% predictable usage.

---

## Delegation by Task Complexity

### Simple Task Example
```
Request: "What is 2+2?"
Agents: 3-5
- analyzer-1
- researcher-1
- validator-2
Time: ~5 seconds
Cost: ~$0.02
```

### Moderate Task Example
```
Request: "Add a login button to my app"
Agents: 5-10
- analyzer-1
- coder-3 (frontend)
- formatter-1
- linter-1
- validator-2
- verifier
Time: ~30 seconds
Cost: ~$0.05
```

### Complex Task Example
```
Request: "Build user authentication system"
Agents: 10-20
- All 8 mandatory agents
- architect-1
- coder-2 (backend)
- database-1
- security-2
- tester-2
- documenter-1
Time: ~2-5 minutes
Cost: ~$0.12
```

### Large Task Example
```
Request: "Build e-commerce platform"
Agents: 20-50
- Full stack coverage
- Multiple parallel execution streams
- Comprehensive testing and security
Time: ~10-30 minutes
Cost: ~$0.40
```

---

## Cost Breakdown (per 10 agents)

- Input tokens (25K @ $1.25 per 1M): $0.03125
- Output tokens (10K @ $5.00 per 1M): $0.05
- **Total per 10 agents: ~$0.08**

Compare to Claude Sonnet 4.5:
- Same task cost: ~$0.30
- **Savings: 73%**

---

## 3-Layer Completion Enforcement

### Layer 1: Ultra-Strict Rules
Shown FIRST to prevent stopping:
- Forbid planning without execution
- Forbid stopping mid-task
- Must DO work, not describe it

### Layer 2: Mandatory Checklist
8 points before completion:
- Request 100% complete
- Code tested and verified
- Zero placeholders
- Production-ready
- User can use immediately
- Tests passing
- Docs complete
- No TODOs/FIXMEs

### Layer 3: Response Blocker
5 checks before EVERY response:
1. Is request 100% complete? (NO → KEEP WORKING)
2. Is code tested? (NO → TEST NOW)
3. Any placeholders? (YES → REMOVE NOW)
4. Production-ready? (NO → FINISH NOW)
5. User needs more work? (YES → COMPLETE NOW)

---

## Quick Start

### Usage
```bash
gemini-cli --agents --task "Your task here"
```

### Result
✅ Optimal agents automatically selected
✅ Tasks executed in parallel where possible
✅ 8 mandatory QA agents verify quality
✅ 3-layer enforcement ensures completion
✅ Production-ready deliverables

---

## Files in This Directory

1. **README.md** - Overview and usage guide
2. **AGENT_REFERENCE.md** - This file (complete agent catalog)
3. **agents/config.json** - 96-agent configuration
4. **docs/MULTI_AGENT_SYSTEM.md** - Detailed system documentation

---

**Total Agents**: 96
**Mandatory Agents**: 8
**Total Categories**: 24
**Model**: Gemini 2.5 Pro
**Cost**: ~$0.08 per 10-agent task
**Savings**: 73% vs Claude

---

Generated: October 19, 2025
Contributor: 15-year-old developer
