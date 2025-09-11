export { InputPrompt } from './ui/components/InputPrompt.js';
export type { InputPromptProps } from './ui/components/InputPrompt.js';

export {
  useTextBuffer,
  type TextBuffer,
  type Viewport,
  logicalPosToOffset,
  offsetToLogicalPos,
} from './ui/components/shared/text-buffer.js';

export {
  KeypressProvider,
  useKeypressContext,
  type Key,
} from './ui/contexts/KeypressContext.js';

export { useKeypress } from './ui/hooks/useKeypress.js';

export { keyMatchers, Command, createKeyMatchers } from './ui/keyMatchers.js';

export { theme } from './ui/semantic-colors.js';

export { SuggestionsDisplay } from './ui/components/SuggestionsDisplay.js';
