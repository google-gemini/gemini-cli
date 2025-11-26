# Instruções para Submeter as Correções

## Issues Corrigidas:

1. **#13854** - Grammar error in README
2. **#13853** - CLI hangs on login in headless environments (P0 - CRITICAL)

## Passos para Submissão:

### 1. Fork do Repositório

- Acesse: https://github.com/google-gemini/gemini-cli
- Clique em "Fork" no canto superior direito

### 2. Adicionar seu Fork como Remote

```bash
cd /home/juan/gemini-cli
git remote add myfork https://github.com/SEU_USERNAME/gemini-cli.git
```

### 3. Push dos Branches

#### Branch 1: Fix Grammar (Issue #13854)

```bash
git checkout fix-grammar-readme-13854
git push myfork fix-grammar-readme-13854
```

#### Branch 2: Fix Headless Auth (Issue #13853)

```bash
git checkout fix-headless-auth-13853
git push myfork fix-headless-auth-13853
```

### 4. Criar Pull Requests

#### PR 1: Grammar Fix

- Vá para: https://github.com/google-gemini/gemini-cli/compare
- Selecione: `base: main` ← `compare: SEU_USERNAME:fix-grammar-readme-13854`
- **Título**: `docs: Fix grammar error in Release Cadence (Nightly section)`
- **Descrição**:

```markdown
Fixes #13854

## Description

Fixed comma splice error in the Nightly release cadence section of README.md.

## Changes

- Changed comma to period before "This" to fix grammatical error

## Testing

- Documentation change only, no code changes
- Verified markdown renders correctly
```

#### PR 2: Headless Auth Fix

- Vá para: https://github.com/google-gemini/gemini-cli/compare
- Selecione: `base: main` ← `compare: SEU_USERNAME:fix-headless-auth-13853`
- **Título**:
  `fix(auth): Ensure auth URL is always visible in headless environments`
- **Descrição**:

```markdown
Fixes #13853

## Description

Fixes regression in v0.18.0 where authentication URL was not visible in headless
environments (SSH/Docker), causing the CLI to hang indefinitely during login.

## Root Cause

The commit bdf80ea7c (#13600) introduced stdout/stderr patching that prevented
the auth URL from being displayed in non-interactive environments.

## Changes

1. Write auth URL directly to stderr using `writeToStderr()` to bypass stdio
   patching
2. Remove fatal error throw when browser fails to open - allow manual
   authentication
3. Improve error messages to reference the URL displayed above
4. Add explicit stderr writes for all auth-related messages

## Testing

- Build passes: `npm run build` ✅
- Should be tested in headless environment (SSH/Docker)
- URL should now be visible even when browser fails to open

## Impact

- Restores v0.17.1 behavior where URL was always visible
- Allows authentication in headless environments
- Non-breaking change for interactive environments
```

### 5. Assinar o CLA

- Antes de submeter, assine o Google CLA: https://cla.developers.google.com/
- Necessário para aceitar contribuições

### 6. Self-Assign Issues

Após criar os PRs, comente nas issues originais:

```
/assign
```

## Comandos de Verificação Antes do Push:

```bash
# Verificar mudanças no branch 1
git checkout fix-grammar-readme-13854
git diff main -- README.md

# Verificar mudanças no branch 2
git checkout fix-headless-auth-13853
git diff main -- packages/core/src/code_assist/oauth2.ts
```

## Notas:

- Cada fix está em seu próprio branch independente
- Seguem Conventional Commits
- Linkar às issues existentes
- Small, focused PRs como recomendado no CONTRIBUTING.md
