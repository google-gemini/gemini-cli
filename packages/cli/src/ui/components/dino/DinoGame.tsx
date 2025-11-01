/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import {
  GraphicsEngine,
  loadDinoSprite,
  loadPterodactylSprite,
  drawSprite,
  drawBooleanSprite,
  type Sprite,
  CACTUS_SMALL,
  CACTUS_LARGE,
  CLOUD,
} from './graphics.js';

// Resolution: 4 dots per line vertically, 2 dots per char horizontally.
// 60 * 1.5 = 90 dots high.
const HEIGHT = 90;
const GROUND_Y = HEIGHT - 10;
const DINO_X = 10;

// Dino sprite constants
const DINO_WIDTH = 22;
const DINO_HEIGHT = 23;
const POSE_START = 0;
const POSE_BLINK = 22;
const POSE_RUN1 = 44;
const POSE_RUN2 = 66;
const POSE_DEAD = 88;
// const POSE_DEAD2 = 110; // Unused for now

// Physics adjusted for higher resolution
const GRAVITY = 1.5;
const JUMP_VELOCITY = -12;
const SPEED_INITIAL = 5;
const MAX_SPEED = 15;
const SPEED_ACCELERATION = 0.002;

interface Obstacle {
  x: number;
  y: number;
  type: 'CACTUS_SMALL' | 'CACTUS_LARGE' | 'PTERODACTYL';
  sprite: boolean[][] | Sprite;
  width: number;
  height: number;
}

interface Cloud {
  x: number;
  y: number;
}

interface DinoGameProps {
  onClose?: () => void;
}

export function DinoGame({ onClose }: DinoGameProps) {
  const { columns } = useTerminalSize();
  // 2 dots per character width
  const width = Math.max(160, (columns - 4) * 2); // -4 for border/padding

  const [gameState, setGameState] = useState<
    'LOADING' | 'WAITING' | 'PLAYING' | 'GAME_OVER'
  >('LOADING');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [dinoY, setDinoY] = useState(GROUND_Y - DINO_HEIGHT);
  const [dinoVy, setDinoVy] = useState(0);
  const [isDucking, setIsDucking] = useState(false);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [clouds, setClouds] = useState<Cloud[]>([]);
  const [tick, setTick] = useState(0);
  const speedRef = useRef(SPEED_INITIAL);

  const [dinoSprite, setDinoSprite] = useState<Sprite | null>(null);
  const [pteroSprite, setPteroSprite] = useState<Sprite | null>(null);

  // Recreate engine when width changes
  const engine = useMemo(() => new GraphicsEngine(width, HEIGHT), [width]);

  useEffect(() => {
    Promise.all([loadDinoSprite(), loadPterodactylSprite()])
      .then(([dino, ptero]) => {
        setDinoSprite(dino);
        setPteroSprite(ptero);
        setDinoY(GROUND_Y - dino.height);
        setGameState('WAITING');
      })
      .catch((err) => {
        console.error('Failed to load sprites', err);
      });
  }, []);

  const resetGame = useCallback(() => {
    if (!dinoSprite) return;
    setGameState('PLAYING');
    setScore(0);
    setDinoY(GROUND_Y - dinoSprite.height);
    setDinoVy(0);
    setObstacles([]);
    setClouds([]);
    setTick(0);
    speedRef.current = SPEED_INITIAL;
  }, [dinoSprite]);

  const spawnPterodactyl = useCallback(() => {
    if (!pteroSprite) return;
    // Pterodactyl should be duckable.
    // Dino standing height is 23.
    // If we put it at GROUND_Y - 20, it's 3 pixels above ground.
    // Dino head is at top.
    const y = GROUND_Y - 25; // Adjust as needed for ducking to work
    setObstacles((prev) => [
      ...prev,
      {
        x: width,
        y,
        type: 'PTERODACTYL',
        sprite: pteroSprite,
        width: pteroSprite.width,
        height: pteroSprite.height,
      },
    ]);
  }, [pteroSprite, width]);

  useInput((input, key) => {
    if (gameState === 'WAITING') {
      if (input === ' ' || key.upArrow) {
        resetGame();
      }
    } else if (gameState === 'PLAYING') {
      if (
        (input === ' ' || key.upArrow) &&
        dinoSprite &&
        dinoY >= GROUND_Y - dinoSprite.height - 1 &&
        !isDucking
      ) {
        setDinoVy(JUMP_VELOCITY);
      }
      setIsDucking(!!key.downArrow);

      if (input === 'p') {
        spawnPterodactyl();
      }
    } else if (gameState === 'GAME_OVER') {
      if (input === ' ' || key.upArrow) {
        resetGame();
      }
    }

    if (input === 'c' && key.ctrl) {
      onClose?.();
    }
  });

  useEffect(() => {
    if (gameState === 'LOADING' || !dinoSprite) return;

    const interval = setInterval(() => {
      setTick((t) => t + 1);

      if (gameState === 'WAITING' || gameState === 'GAME_OVER') {
        return;
      }

      // PLAYING state updates
      setScore((s) => s + 1);

      // Physics
      setDinoVy((vy) => vy + GRAVITY);
      setDinoY((y) => {
        const newY = y + dinoVy;
        const groundLevel = GROUND_Y - DINO_HEIGHT;
        if (newY > groundLevel) {
          setDinoVy(0);
          return groundLevel;
        }
        return newY;
      });

      // Speed up
      speedRef.current = Math.min(
        MAX_SPEED,
        speedRef.current + SPEED_ACCELERATION,
      );

      // Move obstacles
      setObstacles((prev) => {
        const moved = prev.map((o) => ({ ...o, x: o.x - speedRef.current }));
        return moved.filter((o) => o.x > -50);
      });

      // Move clouds
      setClouds((prev) => {
        const moved = prev.map((c) => ({
          ...c,
          x: c.x - speedRef.current * 0.2,
        }));
        return moved.filter((c) => c.x > -50);
      });

      // Spawn obstacles
      if (
        Math.random() < 0.03 &&
        obstacles.length < 3 &&
        (obstacles.length === 0 ||
          width - obstacles[obstacles.length - 1].x > 100)
      ) {
        const typeRand = Math.random();
        let type: Obstacle['type'];
        let sprite: boolean[][] | Sprite;
        let y: number;
        let obsW: number;
        let obsH: number;

        if (score > 1000 && typeRand > 0.8 && pteroSprite) {
          type = 'PTERODACTYL';
          sprite = pteroSprite;
          obsW = pteroSprite.width;
          obsH = pteroSprite.height;
          const heightRand = Math.random();
          if (heightRand > 0.66)
            y = GROUND_Y - 40; // High
          else if (heightRand > 0.33)
            y = GROUND_Y - 25; // Mid (duckable)
          else y = GROUND_Y - 15; // Low (jumpable)
        } else if (typeRand > 0.4) {
          type = 'CACTUS_LARGE';
          sprite = CACTUS_LARGE;
          obsW = CACTUS_LARGE[0].length;
          obsH = CACTUS_LARGE.length;
          y = GROUND_Y - obsH;
        } else {
          type = 'CACTUS_SMALL';
          sprite = CACTUS_SMALL;
          obsW = CACTUS_SMALL[0].length;
          obsH = CACTUS_SMALL.length;
          y = GROUND_Y - obsH;
        }

        setObstacles((prev) => [
          ...prev,
          { x: width, y, type, sprite, width: obsW, height: obsH },
        ]);
      }

      // Spawn clouds
      if (Math.random() < 0.02 && clouds.length < 4) {
        setClouds((prev) => [
          ...prev,
          { x: width, y: Math.floor(Math.random() * 20) + 5 },
        ]);
      }

      // Collision detection
      let dinoH = DINO_HEIGHT * 0.8;
      let dinoYOffset = DINO_HEIGHT * 0.1;
      if (isDucking) {
        // Reduce hitbox height when ducking
        dinoH = DINO_HEIGHT * 0.5;
        dinoYOffset = DINO_HEIGHT * 0.4; // Move hitbox down
      }
      const dinoW = DINO_WIDTH * 0.6;
      const dinoXOffset = DINO_WIDTH * 0.2;

      for (const obs of obstacles) {
        if (
          DINO_X + dinoXOffset < obs.x + obs.width &&
          DINO_X + dinoXOffset + dinoW > obs.x &&
          dinoY + dinoYOffset < obs.y + obs.height &&
          dinoY + dinoYOffset + dinoH > obs.y
        ) {
          setGameState('GAME_OVER');
          setHighScore((prev) => Math.max(prev, score));
        }
      }
    }, 33); // ~30 FPS

    return () => clearInterval(interval);
  }, [
    gameState,
    dinoVy,
    isDucking,
    obstacles,
    clouds,
    tick,
    score,
    dinoSprite,
    pteroSprite,
    dinoY,
    width,
  ]);

  // Rendering
  engine.clear();
  const ctx = engine.ctx;

  if (gameState === 'LOADING') {
    return (
      <Box
        borderStyle="round"
        paddingX={1}
        width="100%"
        height={Math.ceil(HEIGHT / 2) + 2}
        alignItems="center"
        justifyContent="center"
      >
        <Text>Loading...</Text>
      </Box>
    );
  }

  // Ground
  const HORIZON_Y = GROUND_Y - 4;
  for (let i = 0; i < width; i++) {
    if (Math.random() > 0.98) {
      ctx.fillRect(i, HORIZON_Y + 2, 2, 1);
    } else {
      ctx.fillRect(i, HORIZON_Y, 1, 1);
    }
  }

  // Clouds
  clouds.forEach((c) => {
    drawBooleanSprite(ctx, CLOUD, Math.floor(c.x), c.y);
  });

  // Obstacles
  obstacles.forEach((o) => {
    if (
      Array.isArray(o.sprite) &&
      Array.isArray(o.sprite[0]) &&
      typeof o.sprite[0][0] === 'boolean'
    ) {
      drawBooleanSprite(ctx, o.sprite as boolean[][], Math.floor(o.x), o.y);
    } else {
      // It's a Sprite
      drawSprite(ctx, o.sprite as Sprite, Math.floor(o.x), o.y);
    }
  });

  // Dino
  if (dinoSprite) {
    let srcX = POSE_START;
    if (gameState === 'WAITING') {
      const blinkCycle = tick % 90;
      if (blinkCycle > 75) {
        srcX = POSE_BLINK;
      }
    } else if (gameState === 'PLAYING') {
      if (dinoY < GROUND_Y - DINO_HEIGHT) {
        srcX = POSE_START; // Jumping
      } else {
        srcX = Math.floor(tick / 3) % 2 === 0 ? POSE_RUN1 : POSE_RUN2;
      }
    } else if (gameState === 'GAME_OVER') {
      srcX = POSE_DEAD;
    }

    drawSprite(
      ctx,
      dinoSprite,
      DINO_X,
      Math.floor(dinoY),
      srcX,
      0,
      DINO_WIDTH,
      DINO_HEIGHT,
    );
  }

  // Text overlay
  let overlayText = '';
  if (gameState === 'WAITING') {
    overlayText = 'Press Space to Play';
  } else if (gameState === 'GAME_OVER') {
    overlayText = 'GAME OVER';
  }

  const terminalHeight = Math.ceil(HEIGHT / 2);

  return (
    <Box borderStyle="round" paddingX={1} flexDirection="column" width="100%">
      <Box justifyContent="space-between">
        <Text>
          HI {String(Math.floor(highScore)).padStart(5, '0')}{' '}
          {String(Math.floor(score)).padStart(5, '0')}
        </Text>
        <Text color="gray">Press Ctrl+C to quit</Text>
      </Box>
      <Box
        height={terminalHeight}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
      >
        <Text>{engine.toString()}</Text>
        {overlayText && (
          <Box
            position="absolute"
            marginTop={Math.floor(terminalHeight / 2) - 1}
          >
            <Text backgroundColor="white" color="black">
              {' '}
              {overlayText}{' '}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
