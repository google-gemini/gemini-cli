/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';

export const WITTY_LOADING_PHRASES = [
  "I'm Feeling Lucky",
  'Shipping awesomeness... ',
  'Painting the serifs back on...',
  'Navigating the slime mold...',
  'Consulting the digital spirits...',
  'Reticulating splines...',
  'Warming up the AI hamsters...',
  'Asking the magic conch shell...',
  'Generating witty retort...',
  'Polishing the algorithms...',
  "Don't rush perfection (or my code)...",
  'Brewing fresh bytes...',
  'Counting electrons...',
  'Engaging cognitive processors...',
  'Checking for syntax errors in the universe...',
  'One moment, optimizing humor...',
  'Shuffling punchlines...',
  'Untangling neural nets...',
  'Compiling brilliance...',
  'Loading wit.exe...',
  'Summoning the cloud of wisdom...',
  'Preparing a witty response...',
  "Just a sec, I'm debugging reality...",
  'Confuzzling the options...',
  'Tuning the cosmic frequencies...',
  'Crafting a response worthy of your patience...',
  'Compiling the 1s and 0s...',
  'Resolving dependencies... and existential crises...',
  'Defragmenting memories... both RAM and personal...',
  'Rebooting the humor module...',
  'Caching the essentials (mostly cat memes)...',
  'Optimizing for ludicrous speed',
  "Swapping bits... don't tell the bytes...",
  'Garbage collecting... be right back...',
  'Assembling the interwebs...',
  'Converting coffee into code...',
  'Updating the syntax for reality...',
  'Rewiring the synapses...',
  'Looking for a misplaced semicolon...',
  "Greasin' the cogs of the machine...",
  'Pre-heating the servers...',
  'Calibrating the flux capacitor...',
  'Engaging the improbability drive...',
  'Channeling the Force...',
  'Aligning the stars for optimal response...',
  'So say we all...',
  'Loading the next great idea...',
  "Just a moment, I'm in the zone...",
  'Preparing to dazzle you with brilliance...',
  "Just a tick, I'm polishing my wit...",
  "Hold tight, I'm crafting a masterpiece...",
  "Just a jiffy, I'm debugging the universe...",
  "Just a moment, I'm aligning the pixels...",
  "Just a sec, I'm optimizing the humor...",
  "Just a moment, I'm tuning the algorithms...",
  'Warp speed engaged...',
  'Mining for more Dilithium crystals...',
  "Don't panic...",
  'Following the white rabbit...',
  'The truth is in here... somewhere...',
  'Blowing on the cartridge...',
  'Loading... Do a barrel roll!',
  'Waiting for the respawn...',
  'Finishing the Kessel Run in less than 12 parsecs...',
  "The cake is not a lie, it's just still loading...",
  'Fiddling with the character creation screen...',
  "Just a moment, I'm finding the right meme...",
  "Pressing 'A' to continue...",
  'Herding digital cats...',
  'Polishing the pixels...',
  'Finding a suitable loading screen pun...',
  'Distracting you with this witty phrase...',
  'Almost there... probably...',
  'Our hamsters are working as fast as they can...',
  'Giving Cloudy a pat on the head...',
  'Petting the cat...',
  'Rickrolling my boss...',
  'Never gonna give you up, never gonna let you down...',
  'Slapping the bass...',
  'Tasting the snozberries...',
  "I'm going the distance, I'm going for speed...",
  'Is this the real life? Is this just fantasy?...',
  "I've got a good feeling about this...",
  'Poking the bear...',
  'Doing research on the latest memes...',
  'Figuring out how to make this more witty...',
  'Hmmm... let me think...',
  'What do you call a fish with no eyes? A fsh...',
  'Why did the computer go to therapy? It had too many bytes...',
  "Why don't programmers like nature? It has too many bugs...",
  'Why do programmers prefer dark mode? Because light attracts bugs...',
  'Why did the developer go broke? Because they used up all their cache...',
  "What can you do with a broken pencil? Nothing, it's pointless...",
  'Applying percussive maintenance...',
  'Searching for the correct USB orientation...',
  'Ensuring the magic smoke stays inside the wires...',
  'Rewriting in Rust for no particular reason...',
  'Trying to exit Vim...',
  'Spinning up the hamster wheel...',
  "That's not a bug, it's an undocumented feature...",
  'Engage.',
  "I'll be back... with an answer.",
  'My other process is a TARDIS...',
  'Communing with the machine spirit...',
  'Letting the thoughts marinate...',
  'Just remembered where I put my keys...',
  'Pondering the orb...',
  "I've seen things you people wouldn't believe... like a user who reads loading messages.",
  'Initiating thoughtful gaze...',
  "What's a computer's favorite snack? Microchips.",
  "Why do Java developers wear glasses? Because they don't C#.",
  'Charging the laser... pew pew!',
  'Dividing by zero... just kidding!',
  'Looking for an adult superviso... I mean, processing.',
  'Making it go beep boop.',
  'Buffering... because even AIs need a moment.',
  'Entangling quantum particles for a faster response...',
  'Polishing the chrome... on the algorithms.',
  'Are you not entertained? (Working on it!)',
  'Summoning the code gremlins... to help, of course.',
  'Just waiting for the dial-up tone to finish...',
  'Recalibrating the humor-o-meter.',
  'My other loading screen is even funnier.',
  "Pretty sure there's a cat walking on the keyboard somewhere...",
  'Enhancing... Enhancing... Still loading.',
  "It's not a bug, it's a feature... of this loading screen.",
  'Have you tried turning it off and on again? (The loading screen, not me.)',
  'Constructing additional pylons...',
  'New line? That’s Ctrl+J.',
  'Releasing the HypnoDrones...',
];

export const INFORMATIVE_TIPS = [
  //Settings tips start here
  'Set your preferred editor for opening files (/settings)...',
  'Toggle Vim mode for a modal editing experience (/settings)...',
  'Disable automatic updates if you prefer manual control (/settings)...',
  'Turn off nagging update notifications (settings.json)...',
  'Enable checkpointing to recover your session after a crash (settings.json)...',
  'Change CLI output format to JSON for scripting (/settings)...',
  'Personalize your CLI with a new color theme (/settings)...',
  'Create and use your own custom themes (settings.json)...',
  'Hide window title for a more minimal UI (/settings)...',
  "Don't like these tips? You can hide them (/settings)...",
  'Hide the startup banner for a cleaner launch (/settings)...',
  'Reclaim vertical space by hiding the footer (/settings)...',
  'Show memory usage for performance monitoring (/settings)...',
  'Show citations to see where the model gets information (/settings)...',
  'Disable loading phrases for a quieter experience (/settings)...',
  'Add custom witty phrases to the loading screen (settings.json)...',
  'Choose a specific Gemini model for conversations (/settings)...',
  'Limit the number of turns in your session history (/settings)...',
  'Automatically summarize large tool outputs to save tokens (settings.json)...',
  'Control when chat history gets compressed based on token usage (settings.json)...',
  'Define custom context file names, like CONTEXT.md (settings.json)...',
  'Set max directories to scan for context files (/settings)...',
  'Expand your workspace with additional directories (/directory)...',
  'Control how /memory refresh loads context files (/settings)...',
  'Toggle respect for .gitignore files in context (/settings)...',
  'Toggle respect for .geminiignore files in context (/settings)...',
  'Enable recursive file search for @-file completions (/settings)...',
  'Run tools in a secure sandbox environment (settings.json)...',
  'Use an interactive terminal for shell commands (/settings)...',
  'Restrict available built-in tools (settings.json)...',
  'Exclude specific tools from being used (settings.json)...',
  'Bypass confirmation for trusted tools (settings.json)...',
  'Use a custom command for tool discovery (settings.json)...',
  'Define a custom command for calling discovered tools (settings.json)...',
  'Define and manage connections to MCP servers (settings.json)...',
  'Enable folder trust to enhance security (/settings)...',
  'Change your authentication method (/settings)...',
  'Enforce auth type for enterprise use (settings.json)...',
  'Let Node.js auto-configure memory (settings.json)...',
  'Customize the DNS resolution order (settings.json)...',
  'Exclude env vars from the context (settings.json)...',
  'Configure a custom command for filing bug reports (settings.json)...',
  'Enable or disable telemetry collection (/settings)...',
  'Send telemetry data to a local file or GCP (settings.json)...',
  'Configure the OTLP endpoint for telemetry (settings.json)...',
  'Choose whether to log prompt content (settings.json)...',
  'Enable AI-powered prompt completion while typing (/settings)...',
  'Enable debug logging of keystrokes to the console (/settings)...',
  'Enable automatic session cleanup of old conversations (/settings)...',
  'Show Gemini CLI status in the terminal window title (/settings)...',
  'Use the entire width of the terminal for output (/settings)...',
  'Enable screen reader mode for better accessibility (/settings)...',
  'Skip the next speaker check for faster responses (/settings)...',
  'Use ripgrep for faster file content search (/settings)...',
  'Enable truncation of large tool outputs to save tokens (/settings)...',
  'Set the character threshold for truncating tool outputs (/settings)...',
  'Set the number of lines to keep when truncating outputs (/settings)...',
  'Enable policy-based tool confirmation via message bus (/settings)...',
  'Enable smart-edit tool for more precise editing (/settings)...',
  'Enable write_todos_list tool to generate task lists (/settings)...',
  'Enable model routing based on complexity (/settings)...',
  'Enable experimental subagents for task delegation (/settings)...',
  //Settings tips end here
  // Keyboard shortcut tips start here
  'Close dialogs and suggestions with Esc...',
  'Cancel a request with Ctrl+C, or press twice to exit...',
  'Exit the app with Ctrl+D on an empty line...',
  'Clear your screen at any time with Ctrl+L...',
  'Toggle the debug console display with Ctrl+O...',
  'See full, untruncated responses with Ctrl+S...',
  'Show or hide tool descriptions with Ctrl+T...',
  'Toggle auto-approval (YOLO mode) for all tools with Ctrl+Y...',
  'Toggle shell mode by typing ! in an empty prompt...',
  'Insert a newline with a backslash (\\) followed by Enter...',
  'Navigate your prompt history with the Up and Down arrows...',
  'You can also use Ctrl+P (up) and Ctrl+N (down) for history...',
  'Submit your prompt to Gemini with Enter...',
  'Accept an autocomplete suggestion with Tab or Enter...',
  'Move to the start of the line with Ctrl+A or Home...',
  'Move to the end of the line with Ctrl+E or End...',
  'Move one character left or right with Ctrl+B/F or the arrow keys...',
  'Move one word left or right with Ctrl+Left/Right Arrow...',
  'Delete the character to the left with Ctrl+H or Backspace...',
  'Delete the character to the right with Ctrl+D or Delete...',
  'Delete the word to the left of the cursor with Ctrl+W...',
  'Delete the word to the right of the cursor with Ctrl+Delete...',
  'Delete from the cursor to the start of the line with Ctrl+U...',
  'Delete from the cursor to the end of the line with Ctrl+K...',
  'Clear the entire input prompt with a double-press of Esc...',
  'Paste from your clipboard with Ctrl+V...',
  'Open the current prompt in an external editor with Ctrl+X...',
  'In menus, move up/down with k/j or the arrow keys...',
  'In menus, select an item by typing its number...',
  "If you're using an IDE, see the context with Ctrl+G...",
  // Keyboard shortcut tips end here
  // Command tips start here
  'Show version info with /about...',
  'Change your authentication method with /auth...',
  'File a bug report directly with /bug...',
  'List your saved chat checkpoints with /chat list...',
  'Save your current conversation with /chat save <tag>...',
  'Resume a saved conversation with /chat resume <tag>...',
  'Delete a conversation checkpoint with /chat delete <tag>...',
  'Share your conversation to a file with /chat share <file>...',
  'Clear the screen and history with /clear...',
  'Save tokens by summarizing the context with /compress...',
  'Copy the last response to your clipboard with /copy...',
  'Open the full documentation in your browser with /docs...',
  'Add directories to your workspace with /directory add <path>...',
  'Show all directories in your workspace with /directory show...',
  'Set your preferred external editor with /editor...',
  'List all active extensions with /extensions list...',
  'Update all or specific extensions with /extensions update...',
  'Get help on commands with /help...',
  'Manage IDE integration with /ide...',
  'Create a project-specific GEMINI.md file with /init...',
  'List configured MCP servers and tools with /mcp list...',
  'Authenticate with an OAuth-enabled MCP server with /mcp auth...',
  'Restart MCP servers with /mcp refresh...',
  'See the current instructional context with /memory show...',
  'Add content to the instructional memory with /memory add...',
  'Reload instructional context from GEMINI.md files with /memory refresh...',
  'List the paths of the GEMINI.md files in use with /memory list...',
  'Display the privacy notice with /privacy...',
  'Exit the CLI with /quit or /exit...',
  'Check model-specific usage stats with /stats model...',
  'Check tool-specific usage stats with /stats tools...',
  "Change the CLI's color theme with /theme...",
  'List all available tools with /tools...',
  'View and edit settings with the /settings editor...',
  'Toggle Vim keybindings on and off with /vim...',
  'Set up GitHub Actions with /setup-github...',
  'Configure terminal keybindings for multiline input with /terminal-setup...',
  'Find relevant documentation with /find-docs...',
  'Review a pull request with /oncall:pr-review...',
  'Go back to main and clean up the branch with /github:cleanup-back-to-main...',
  'Execute any shell command with !<command>...',
  // Command tips end here
];

export const PHRASE_CHANGE_INTERVAL_MS = 15000;

/**
 * Custom hook to manage cycling through loading phrases.
 * @param isActive Whether the phrase cycling should be active.
 * @param isWaiting Whether to show a specific waiting phrase.
 * @returns The current loading phrase.
 */
export const usePhraseCycler = (
  isActive: boolean,
  isWaiting: boolean,
  customPhrases?: string[],
) => {
  const loadingPhrases =
    customPhrases && customPhrases.length > 0
      ? customPhrases
      : WITTY_LOADING_PHRASES;

  const [currentLoadingPhrase, setCurrentLoadingPhrase] = useState(
    loadingPhrases[0],
  );
  const phraseIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isWaiting) {
      setCurrentLoadingPhrase('Waiting for user confirmation...');
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
    } else if (isActive) {
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
      }

      const setRandomPhrase = () => {
        if (customPhrases && customPhrases.length > 0) {
          const randomIndex = Math.floor(Math.random() * customPhrases.length);
          setCurrentLoadingPhrase(customPhrases[randomIndex]);
        } else {
          // Roughly 1 in 6 chance to show a tip.
          const showTip = Math.random() < 1 / 6;
          const phraseList = showTip ? INFORMATIVE_TIPS : WITTY_LOADING_PHRASES;
          const randomIndex = Math.floor(Math.random() * phraseList.length);
          setCurrentLoadingPhrase(phraseList[randomIndex]);
        }
      };

      // Select an initial random phrase
      setRandomPhrase();

      phraseIntervalRef.current = setInterval(() => {
        // Select a new random phrase
        setRandomPhrase();
      }, PHRASE_CHANGE_INTERVAL_MS);
    } else {
      // Idle or other states, clear the phrase interval
      // and reset to the first phrase for next active state.
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
      setCurrentLoadingPhrase(loadingPhrases[0]);
    }

    return () => {
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
    };
  }, [isActive, isWaiting, customPhrases, loadingPhrases]);

  return currentLoadingPhrase;
};
