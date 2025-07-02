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
  'Running sudo make me a sandwich...',
  'Optimizing for ludicrous speed',
  "Swapping bits... don't tell the bytes...",
  'Garbage collecting... be right back...',
  'Assembling the interwebs...',
  'Converting coffee into code...',
  'Pushing to production (and hoping for the best)...',
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
  "I'm Giving Her all she's got Captain!",
  "Don't panic...",
  'Following the white rabbit...',
  'The truth is in here... somewhere...',
  'Blowing on the cartridge...',
  'Looking for the princess in another castle...',
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
  'Why did the developer go broke? Because he used up all his cache...',
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
];

export const PHRASE_CHANGE_INTERVAL_MS = 15000;

/**
 * Custom hook to manage cycling through loading phrases.
 * @param isActive Whether the phrase cycling should be active.
 * @param isWaiting Whether to show a specific waiting phrase.
 * @returns The current loading phrase.
 */
export const usePhraseCycler = (isActive: boolean, isWaiting: boolean) => {
  const [currentLoadingPhrase, setCurrentLoadingPhrase] = useState(
    WITTY_LOADING_PHRASES[0],
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
      // Select an initial random phrase
      const initialRandomIndex = Math.floor(
        Math.random() * WITTY_LOADING_PHRASES.length,
      );
      setCurrentLoadingPhrase(WITTY_LOADING_PHRASES[initialRandomIndex]);

      phraseIntervalRef.current = setInterval(() => {
        // Select a new random phrase
        const randomIndex = Math.floor(
          Math.random() * WITTY_LOADING_PHRASES.length,
        );
        setCurrentLoadingPhrase(WITTY_LOADING_PHRASES[randomIndex]);
      }, PHRASE_CHANGE_INTERVAL_MS);
    } else {
      // Idle or other states, clear the phrase interval
      // and reset to the first phrase for next active state.
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
      setCurrentLoadingPhrase(WITTY_LOADING_PHRASES[0]);
    }

    return () => {
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
    };
  }, [isActive, isWaiting]);

  return currentLoadingPhrase;
};
