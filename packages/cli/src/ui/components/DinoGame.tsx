/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';

const FPS = 24;
const TICK_DURATION = Math.floor(1000 / FPS);
const WIDTH = 80;
const HEIGHT = 14;
const GROUND_Y = HEIGHT - 2;
const GRAVITY = 1;
const JUMP_VELOCITY = -4;

// --- DINO SPRITES ---
const DINO_RUN_1 = [
  '       ++++ ',
  '++    ++O+++',
  ' + +++++_ww ',
  '  ++++++    ',
  '   |   |    ',
];

const DINO_RUN_2 = [
  '       ++++ ',
  ' +    ++O+++',
  ' + +++++_ww ',
  '  ++++++    ',
  '   /   /    ',
];

const DINO_DUCK_1 = [
  '       ++++ ',
  ' -    ++U+++',
  '  ++++++__w ',
  '   :   :    ',
];

const DINO_DUCK_2 = [
  '       ++++ ',
  ' +    ++U+++',
  '  ++++++__w ',
  '   ;   ;    ',
];

const DINO_JUMP = DINO_RUN_1; // same base logic for airborne, maybe legs don't move

// --- OBSTACLE SPRITES ---
const CACTUS_LARGE = ['  |  ', '(_|_)', '  |  '];

const CACTUS_SMALL = [' /:\\ ', ' | | '];

const PTERODACTYL_UP = [' \\       ', ' <O=-    ', ' /       '];

const PTERODACTYL_DOWN = ['         ', ' <o=-    ', '         '];

// --- CLOUDS ---
const CLOUD_SPRITE = ['   .--.    ', ' .(    ).  ', '(________) '];

type GameState = 'playing' | 'gameover';

interface Obstacle {
  x: number;
  y: number;
  type: 'cactus_large' | 'cactus_small' | 'bird';
  width: number;
  height: number;
  spriteIndex: number; // for animated obstacles like birds
}

interface Cloud {
  x: number;
  y: number;
}

export function DinoGame({ onExit }: { onExit: () => void }) {
  const [gameState, setGameState] = useState<GameState>('playing');
  const [dinoY, setDinoY] = useState(GROUND_Y);
  const [dinoVelocity, setDinoVelocity] = useState(0);
  const [isDucking, setIsDucking] = useState(false);
  const [animFrame, setAnimFrame] = useState(0);

  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [clouds, setClouds] = useState<Cloud[]>([
    { x: 60, y: 2 },
    { x: 30, y: 4 },
  ]);
  const [ground, setGround] = useState<string>(Array(WIDTH).fill('_').join(''));
  const [score, setScore] = useState(0);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [ticks, setTicks] = useState(0);

  // --- INPUT HANDLING ---
  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onExit();
      return;
    }

    if (
      gameState === 'gameover' &&
      (input === 'r' || key.return || input === ' ')
    ) {
      resetGame();
      return;
    }

    if (gameState === 'playing') {
      if (
        (key.upArrow || input === ' ' || input === 'w') &&
        dinoY === GROUND_Y
      ) {
        setDinoVelocity(JUMP_VELOCITY);
        setIsDucking(false);
      } else if (key.downArrow || input === 's') {
        setIsDucking(true);
        if (dinoY < GROUND_Y) {
          // Fast drop
          setDinoVelocity((prev) => prev + 2);
        }
      }
    }
  });

  // Handle release of down arrow
  // Ink's useInput doesn't easily support keyup. We rely on the game loop to clear ducking
  // if not being pressed, but we can't detect held keys. So ducking will be a toggle or auto-recover.
  // For simplicity, recovering after 10 ticks of ducking.
  useEffect(() => {
    if (isDucking && dinoY === GROUND_Y) {
      const timer = setTimeout(() => setIsDucking(false), 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isDucking, dinoY]);

  const resetGame = () => {
    setGameState('playing');
    setDinoY(GROUND_Y);
    setDinoVelocity(0);
    setIsDucking(false);
    setObstacles([]);
    setScore(0);
    setSpeedMultiplier(1);
    setTicks(0);
  };

  // Unified Physics & Elements Update
  useEffect(() => {
    if (gameState !== 'playing') return;

    const interval = setInterval(() => {
      // DINO PHYSICS
      let newDinoY = dinoY + dinoVelocity;
      let newVelocity = dinoVelocity + GRAVITY;

      if (newDinoY >= GROUND_Y) {
        newDinoY = GROUND_Y;
        newVelocity = 0;
      }

      setDinoY(newDinoY);
      setDinoVelocity(newVelocity);

      // Animation
      if (ticks % 4 === 0) setAnimFrame((f) => (f + 1) % 2);

      // Score and Speed
      setScore((s) => s + 1);
      if (score > 0 && score % 500 === 0) setSpeedMultiplier((m) => m + 0.1);

      // Move Ground
      if (ticks % 2 === 0) {
        const groundChars = ['_', '.', ',', ' '];
        setGround(
          (g) =>
            g.slice(1) +
            groundChars[Math.floor(Math.random() * groundChars.length)],
        );
      }

      // Move Clouds
      if (ticks % 4 === 0) {
        setClouds((prev) => {
          const moved = prev
            .map((c) => ({ ...c, x: c.x - 1 }))
            .filter((c) => c.x > -15);
          if (Math.random() < 0.02 && moved.length < 4) {
            moved.push({ x: WIDTH, y: Math.floor(Math.random() * 4) + 1 });
          }
          return moved;
        });
      }

      // Move and Spawn Obstacles
      const speed = Math.max(1, Math.floor(1.5 * speedMultiplier));
      setObstacles((prev) => {
        const moved = prev
          .map((o) => ({
            ...o,
            x: o.x - speed,
            spriteIndex:
              ticks % 8 === 0 ? (o.spriteIndex + 1) % 2 : o.spriteIndex,
          }))
          .filter((o) => o.x > -10);

        // Spawning logic
        const canSpawn =
          moved.length === 0 ||
          moved[moved.length - 1].x < WIDTH - (Math.random() * 30 + 20);
        if (canSpawn && Math.random() < 0.05) {
          const typeRand = Math.random();
          if (typeRand < 0.5) {
            moved.push({
              x: WIDTH,
              y: GROUND_Y,
              type: 'cactus_large',
              width: 5,
              height: 3,
              spriteIndex: 0,
            });
          } else if (typeRand < 0.8) {
            moved.push({
              x: WIDTH,
              y: GROUND_Y,
              type: 'cactus_small',
              width: 5,
              height: 2,
              spriteIndex: 0,
            });
          } else {
            // Bird
            const birdY = Math.random() < 0.5 ? GROUND_Y - 2 : GROUND_Y - 4; // High and low birds
            moved.push({
              x: WIDTH,
              y: birdY,
              type: 'bird',
              width: 9,
              height: 3,
              spriteIndex: 0,
            });
          }
        }
        return moved;
      });
    }, TICK_DURATION);

    return () => clearInterval(interval);
  }, [gameState, dinoY, dinoVelocity, ticks, score, speedMultiplier]);

  // --- COLLISION DETECTION ---
  useEffect(() => {
    if (gameState !== 'playing') return;

    // Dino bounding box
    const dinoX = 4;
    const dinoWidth = 10;
    const dinoHeight = isDucking ? 4 : 5;
    const currDinoY = dinoY - dinoHeight + 1; // Top Y

    for (const obs of obstacles) {
      const obsTop = obs.y - obs.height + 1;

      // Hitbox intersection check
      if (
        dinoX < obs.x + obs.width - 2 &&
        dinoX + dinoWidth - 2 > obs.x &&
        currDinoY < obsTop + obs.height - 1 &&
        currDinoY + dinoHeight - 1 > obsTop
      ) {
        setGameState('gameover');
      }
    }
  }, [obstacles, dinoY, isDucking, gameState]);

  // --- RENDER BUFFER ---
  const screenBuffer = useMemo(() => {
    // Initialize empty screen
    const rows: string[][] = Array.from({ length: HEIGHT }, () =>
      new Array<string>(WIDTH).fill(' '),
    );

    // Draw Ground
    for (let c = 0; c < WIDTH; c++) {
      rows[GROUND_Y][c] = ground[c] || '_';
    }

    // Draw Clouds
    clouds.forEach((cloud) => {
      CLOUD_SPRITE.forEach((line, r) => {
        for (let c = 0; c < line.length; c++) {
          const x = Math.floor(cloud.x) + c;
          const y = cloud.y + r;
          if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
            rows[y][x] = line[c]!;
          }
        }
      });
    });

    // Draw Obstacles
    obstacles.forEach((obs) => {
      let spriteLines: string[] = [];
      if (obs.type === 'cactus_large') spriteLines = CACTUS_LARGE;
      if (obs.type === 'cactus_small') spriteLines = CACTUS_SMALL;
      if (obs.type === 'bird')
        spriteLines = obs.spriteIndex === 0 ? PTERODACTYL_UP : PTERODACTYL_DOWN;

      const topY = obs.y - spriteLines.length + 1;
      spriteLines.forEach((line, r) => {
        for (let c = 0; c < line.length; c++) {
          const x = Math.floor(obs.x) + c;
          const y = topY + r;
          if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT && line[c] !== ' ') {
            rows[y][x] = line[c]!;
          }
        }
      });
    });

    // Draw Dino
    let dinoSprite = DINO_RUN_1;
    if (dinoY < GROUND_Y) dinoSprite = DINO_JUMP;
    else if (isDucking)
      dinoSprite = animFrame === 0 ? DINO_DUCK_1 : DINO_DUCK_2;
    else dinoSprite = animFrame === 0 ? DINO_RUN_1 : DINO_RUN_2;

    const dinoTopY = dinoY - dinoSprite.length + 1;
    dinoSprite.forEach((line, r) => {
      for (let c = 0; c < line.length; c++) {
        const x = 4 + c; // Dino is fixed at x=4
        const y = Math.floor(dinoTopY) + r;
        if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT && line[c] !== ' ') {
          rows[y][x] = line[c]!;
        }
      }
    });

    return rows.map((r) => r.join(''));
  }, [ground, clouds, obstacles, dinoY, isDucking, animFrame]);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      paddingX={2}
      paddingY={1}
      width={86}
    >
      <Box justifyContent="space-between" width={WIDTH}>
        <Text color="gray" dimColor>
          HI {String(Math.floor(score / 2)).padStart(5, '0')}
        </Text>
        <Text bold>DINO RUN</Text>
        <Text>{String(score).padStart(5, '0')}</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {screenBuffer.map((line, i) => (
          <Text key={i} wrap="truncate">
            {line}
          </Text>
        ))}
      </Box>

      {gameState === 'gameover' && (
        <Box
          position="absolute"
          width="100%"
          height="100%"
          alignItems="center"
          justifyContent="center"
          flexDirection="column"
        >
          <Box
            borderStyle="single"
            borderColor="red"
            padding={1}
            backgroundColor="black"
          >
            <Text color="red" bold>
              {' '}
              G A M E O V E R{' '}
            </Text>
          </Box>
          <Text dimColor>Press R to Restart, Q to Quit</Text>
        </Box>
      )}
    </Box>
  );
}
