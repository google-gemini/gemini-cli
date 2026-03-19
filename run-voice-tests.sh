#!/bin/bash
cd "$(dirname "$0")"
npx vitest run \
  packages/cli/src/ui/hooks/useVoiceInput.test.ts \
  packages/cli/src/ui/hooks/useVoiceInput.log-volume.test.ts \
  packages/cli/src/ui/hooks/useVoiceInput.stress.test.ts \
  packages/cli/src/ui/hooks/useVoiceInput.replication.test.tsx \
  packages/cli/src/ui/contexts/VoiceContext.test.tsx
