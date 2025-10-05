/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Highlight, themes } from 'prism-react-renderer';

interface CodeHighlightProps {
  code: string;
  language?: string;
  className?: string;
  maxHeight?: string;
}

export const CodeHighlight: React.FC<CodeHighlightProps> = ({
  code,
  language = 'python',
  className = '',
  maxHeight
}) => (
  <Highlight
    theme={themes.vsDark}
    code={code}
    language={language}
  >
    {({ style, tokens, getLineProps, getTokenProps }) => (
      <pre
        style={{
          ...style,
          maxHeight: maxHeight || 'none',
          overflowY: maxHeight ? 'auto' : 'visible'
        }}
        className={`text-xs font-mono rounded px-3 py-2 overflow-x-auto ${className}`}
      >
        {tokens.map((line, i) => (
          <div key={i} {...getLineProps({ line })}>
            {line.map((token, key) => (
              <span key={key} {...getTokenProps({ token })} />
            ))}
          </div>
        ))}
      </pre>
    )}
  </Highlight>
);
