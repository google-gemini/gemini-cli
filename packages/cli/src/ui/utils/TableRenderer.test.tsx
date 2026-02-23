/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { TableRenderer } from './TableRenderer.js';
import { renderWithProviders } from '../../test-utils/render.js';

describe('TableRenderer', () => {
  it('renders a 3x3 table correctly', () => {
    const headers = ['Header 1', 'Header 2', 'Header 3'];
    const rows = [
      ['Row 1, Col 1', 'Row 1, Col 2', 'Row 1, Col 3'],
      ['Row 2, Col 1', 'Row 2, Col 2', 'Row 2, Col 3'],
      ['Row 3, Col 1', 'Row 3, Col 2', 'Row 3, Col 3'],
    ];
    const terminalWidth = 80;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Header 1');
    expect(output).toContain('Row 1, Col 1');
    expect(output).toContain('Row 3, Col 3');
    expect(output).toMatchSnapshot();
  });

  it('renders a table with long headers and 4 columns correctly', () => {
    const headers = [
      'Very Long Column Header One',
      'Very Long Column Header Two',
      'Very Long Column Header Three',
      'Very Long Column Header Four',
    ];
    const rows = [
      ['Data 1.1', 'Data 1.2', 'Data 1.3', 'Data 1.4'],
      ['Data 2.1', 'Data 2.2', 'Data 2.3', 'Data 2.4'],
      ['Data 3.1', 'Data 3.2', 'Data 3.3', 'Data 3.4'],
    ];
    const terminalWidth = 80;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    // Since terminalWidth is 80 and headers are long, they might be truncated.
    // We just check for some of the content.
    expect(output).toContain('Data 1.1');
    expect(output).toContain('Data 3.4');
    expect(output).toMatchSnapshot();
  });

  it('wraps long cell content correctly', () => {
    const headers = ['Col 1', 'Col 2', 'Col 3'];
    const rows = [
      [
        'Short',
        'This is a very long cell content that should wrap to multiple lines',
        'Short',
      ],
    ];
    const terminalWidth = 50;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('This is a very');
    expect(output).toContain('long cell');
    expect(output).toMatchSnapshot();
  });

  it('wraps all long columns correctly', () => {
    const headers = ['Col 1', 'Col 2', 'Col 3'];
    const rows = [
      [
        'This is a very long text that needs wrapping in column 1',
        'This is also a very long text that needs wrapping in column 2',
        'And this is the third long text that needs wrapping in column 3',
      ],
    ];
    const terminalWidth = 60;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('wrapping in');
    expect(output).toMatchSnapshot();
  });

  it('wraps mixed long and short columns correctly', () => {
    const headers = ['Short', 'Long', 'Medium'];
    const rows = [
      [
        'Tiny',
        'This is a very long text that definitely needs to wrap to the next line',
        'Not so long',
      ],
    ];
    const terminalWidth = 50;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Tiny');
    expect(output).toContain('definitely needs');
    expect(output).toMatchSnapshot();
  });

  // The snapshot looks weird but checked on VS Code terminal and it looks fine
  it('wraps columns with punctuation correctly', () => {
    const headers = ['Punctuation 1', 'Punctuation 2', 'Punctuation 3'];
    const rows = [
      [
        'Start. Stop. Comma, separated. Exclamation! Question? hyphen-ated',
        'Semi; colon: Pipe| Slash/ Backslash\\',
        'At@ Hash# Dollar$ Percent% Caret^ Ampersand& Asterisk*',
      ],
    ];
    const terminalWidth = 60;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Start. Stop.');
    expect(output).toMatchSnapshot();
  });

  it('strips bold markers from headers and renders them correctly', () => {
    const headers = ['**Bold Header**', 'Normal Header', '**Another Bold**'];
    const rows = [['Data 1', 'Data 2', 'Data 3']];
    const terminalWidth = 50;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    // The output should NOT contain the literal '**'
    expect(output).not.toContain('**Bold Header**');
    expect(output).toContain('Bold Header');
    expect(output).toMatchSnapshot();
  });

  it('handles wrapped bold headers without showing markers', () => {
    const headers = [
      '**Very Long Bold Header That Will Wrap**',
      'Short',
      '**Another Long Header**',
    ];
    const rows = [['Data 1', 'Data 2', 'Data 3']];
    const terminalWidth = 40;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    // Markers should be gone
    expect(output).not.toContain('**');
    expect(output).toContain('Very Long');
    expect(output).toMatchSnapshot();
  });

  it('renders a complex table with mixed content lengths correctly', () => {
    const headers = [
      'Comprehensive Architectural Specification for the Distributed Infrastructure Layer',
      'Implementation Details for the High-Throughput Asynchronous Message Processing Pipeline with Extended Scalability Features and Redundancy Protocols',
      'Longitudinal Performance Analysis Across Multi-Regional Cloud Deployment Clusters',
      'Strategic Security Framework for Mitigating Sophisticated Cross-Site Scripting Vulnerabilities',
      'Key',
      'Status',
      'Version',
      'Owner',
    ];
    const rows = [
      [
        'The primary architecture utilizes a decoupled microservices approach, leveraging container orchestration for scalability and fault tolerance in high-load scenarios.\n\nThis layer provides the fundamental building blocks for service discovery, load balancing, and inter-service communication via highly efficient protocol buffers.\n\nAdvanced telemetry and logging integrations allow for real-time monitoring of system health and rapid identification of bottlenecks within the service mesh.',
        'Each message is processed through a series of specialized workers that handle data transformation, validation, and persistent storage using a persistent queue.\n\nThe pipeline features built-in retry mechanisms with exponential backoff to ensure message delivery integrity even during transient network or service failures.\n\nHorizontal autoscaling is triggered automatically based on the depth of the processing queue, ensuring consistent performance during unexpected traffic spikes.',
        'Historical data indicates a significant reduction in tail latency when utilizing edge computing nodes closer to the geographic location of the end-user base.\n\nMonitoring tools have captured a steady increase in throughput efficiency since the introduction of the vectorized query engine in the primary data warehouse.\n\nResource utilization metrics demonstrate that the transition to serverless compute for intermittent tasks has resulted in a thirty percent cost optimization.',
        'A multi-layered defense strategy incorporates content security policies, input sanitization libraries, and regular automated penetration testing routines.\n\nDevelopers are required to undergo mandatory security training focusing on the OWASP Top Ten to ensure that security is integrated into the initial design phase.\n\nThe implementation of a robust Identity and Access Management system ensures that the principle of least privilege is strictly enforced across all environments.',
        'INF',
        'Active',
        'v2.4',
        'J. Doe',
      ],
    ];

    const terminalWidth = 160;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
      { width: terminalWidth },
    );

    const output = lastFrame();

    expect(output).toContain('Comprehensive Architectural');
    expect(output).toContain('protocol buffers');
    expect(output).toContain('exponential backoff');
    expect(output).toContain('vectorized query engine');
    expect(output).toContain('OWASP Top Ten');
    expect(output).toContain('INF');
    expect(output).toContain('Active');
    expect(output).toContain('v2.4');
    // "J. Doe" might wrap due to column width constraints
    expect(output).toContain('J.');
    expect(output).toContain('Doe');

    expect(output).toMatchSnapshot();
  });

  it.each([
    {
      name: 'handles non-ASCII characters (emojis and Asian scripts) correctly',
      headers: ['Emoji 😃', 'Asian 汉字', 'Mixed 🚀 Text'],
      rows: [
        ['Start 🌟 End', '你好世界', 'Rocket 🚀 Man'],
        ['Thumbs 👍 Up', 'こんにちは', 'Fire 🔥'],
      ],
      terminalWidth: 60,
      expected: ['Emoji 😃', 'Asian 汉字', '你好世界'],
    },
    {
      name: 'renders a table with only emojis and text correctly',
      headers: ['Happy 😀', 'Rocket 🚀', 'Heart ❤️'],
      rows: [
        ['Smile 😃', 'Fire 🔥', 'Love 💖'],
        ['Cool 😎', 'Star ⭐', 'Blue 💙'],
      ],
      terminalWidth: 60,
      expected: ['Happy 😀', 'Smile 😃', 'Fire 🔥'],
    },
    {
      name: 'renders a table with only Asian characters and text correctly',
      headers: ['Chinese 中文', 'Japanese 日本語', 'Korean 한국어'],
      rows: [
        ['你好', 'こんにちは', '안녕하세요'],
        ['世界', '世界', '세계'],
      ],
      terminalWidth: 60,
      expected: ['Chinese 中文', '你好', 'こんにちは'],
    },
    {
      name: 'renders a table with mixed emojis, Asian characters, and text correctly',
      headers: ['Mixed 😃 中文', 'Complex 🚀 日本語', 'Text 📝 한국어'],
      rows: [
        ['你好 😃', 'こんにちは 🚀', '안녕하세요 📝'],
        ['World 🌍', 'Code 💻', 'Pizza 🍕'],
      ],
      terminalWidth: 80,
      expected: ['Mixed 😃 中文', '你好 😃', 'こんにちは 🚀'],
    },
  ])('$name', ({ headers, rows, terminalWidth, expected }) => {
    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
      { width: terminalWidth },
    );

    const output = lastFrame();
    expected.forEach((text) => {
      expect(output).toContain(text);
    });
    expect(output).toMatchSnapshot();
  });

  it.each([
    {
      name: 'renders correctly when headers are empty but rows have data',
      headers: [] as string[],
      rows: [['Data 1', 'Data 2']],
      expected: ['Data 1', 'Data 2'],
    },
    {
      name: 'renders correctly when there are more headers than columns in rows',
      headers: ['Header 1', 'Header 2', 'Header 3'],
      rows: [['Data 1', 'Data 2']],
      expected: ['Header 1', 'Header 2', 'Header 3', 'Data 1', 'Data 2'],
    },
  ])('$name', ({ headers, rows, expected }) => {
    const terminalWidth = 50;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    expected.forEach((text) => {
      expect(output).toContain(text);
    });
    expect(output).toMatchSnapshot();
  });

  it('renders complex markdown in rows and calculates widths correctly', () => {
    const headers = ['Feature', 'Markdown'];
    const rows = [
      ['Bold', '**Bold Text**'],
      ['Italic', '_Italic Text_'],
      ['Combined', '***Bold and Italic***'],
      ['Link', '[Google](https://google.com)'],
      ['Code', '`const x = 1`'],
      ['Strikethrough', '~~Strike~~'],
      ['Underline', '<u>Underline</u>'],
    ];
    const terminalWidth = 80;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    // Markers should be gone
    expect(output).not.toContain('**Bold Text**');
    expect(output).toContain('Bold Text');
    expect(output).not.toContain('_Italic Text_');
    expect(output).toContain('Italic Text');
    expect(output).toContain('Bold and Italic');
    expect(output).toContain('Google (https://google.com)');
    expect(output).toContain('const x = 1');
    expect(output).not.toContain('`const x = 1`');
    expect(output).toContain('Strike');
    expect(output).toContain('Underline');
    expect(output).toMatchSnapshot();
  });

  it('calculates column widths based on rendered text, not raw markdown', () => {
    const headers = ['Col 1', 'Col 2', 'Col 3'];
    // "**123456**" is 10 characters raw, but 6 characters rendered.
    const rows = [
      ['**123456**', 'Normal', 'Short'],
      ['Short', '**123456**', 'Normal'],
      ['Normal', 'Short', '**123456**'],
    ];
    const terminalWidth = 40;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    expect(output).toBeDefined();

    // We expect "123456" to be on a single line if width calculation is correct
    expect(output).toContain('123456');
    // Find the lines containing the data and check they don't have partial text
    const dataLines = output!.split('\n').filter((l) => /123456/.test(l));
    // Each row should have one line for the data containing "123456"
    expect(dataLines.length).toBe(3);
  });

  it('handles nested markdown styles recursively', () => {
    const headers = ['Header 1', 'Header 2', 'Header 3'];
    const rows = [
      ['**Bold with _Italic_ and ~~Strike~~**', 'Normal', 'Short'],
      ['Short', '**Bold with _Italic_ and ~~Strike~~**', 'Normal'],
      ['Normal', 'Short', '**Bold with _Italic_ and ~~Strike~~**'],
    ];
    const terminalWidth = 100;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    expect(output).toBeDefined();
    expect(output).not.toContain('**');
    expect(output).not.toContain('_');
    expect(output).not.toContain('~~');
    expect(output).toContain('Bold with Italic and Strike');
    expect(output).toMatchSnapshot();
  });

  it('calculates width correctly for content with URLs and styles', () => {
    const headers = ['Col 1', 'Col 2', 'Col 3'];
    // "Visit [Google](https://google.com)"
    // Rendered: Visit Google (https://google.com)
    // "Visit " (6) + "Google" (6) + " (" (2) + "https://google.com" (18) + ")" (1) = 33 chars.
    const rows = [
      ['Visit [Google](https://google.com)', 'Plain Text', 'More Info'],
      ['Info Here', 'Visit [Bing](https://bing.com)', 'Links'],
      ['Check This', 'Search', 'Visit [Yahoo](https://yahoo.com)'],
    ];
    const terminalWidth = 120;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    expect(output).toBeDefined();
    expect(output).toContain('Visit Google (https://google.com)');
    expect(output).toContain('Visit Bing (https://bing.com)');
    expect(output).toContain('Visit Yahoo (https://yahoo.com)');
    // Check that it didn't wrap for the first URL
    const dataLine = output!
      .split('\n')
      .find((l) => l.includes('Visit Google'));
    expect(dataLine).toContain('Visit Google (https://google.com)');
    expect(output).toMatchSnapshot();
  });

  it('does not parse markdown inside code snippets', () => {
    const headers = ['Col 1', 'Col 2', 'Col 3'];
    const rows = [
      ['`**not bold**`', '`_not italic_`', '`~~not strike~~`'],
      ['`[not link](url)`', '`<u>not underline</u>`', '`https://not.link`'],
      ['Normal Text', 'More Code: `*test*`', '`***nested***`'],
    ];
    const terminalWidth = 100;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    expect(output).toBeDefined();
    // Markers should be visible inside code snippets
    expect(output).toContain('**not bold**');
    expect(output).toContain('_not italic_');
    expect(output).toContain('~~not strike~~');
    expect(output).toContain('[not link](url)');
    expect(output).toContain('<u>not underline</u>');
    expect(output).toContain('https://not.link');
    expect(output).toContain('***nested***');
    expect(output).toMatchSnapshot();
  });
});
