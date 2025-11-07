/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Box, Text } from 'ink';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { useInterval } from '../../hooks/useInterval.js';
import { debugState } from '../../debug.js';
import {
  GraphicsEngine,
  loadDinoSprite,
  loadPterodactylSprite,
  loadCloudSprite,
  loadDinoDuckLeftSprite,
  loadDinoDuckRightSprite,
  loadObstacleLargeSprite,
  loadObstacleSmallSprite,
  loadHorizonSprite,
  loadGameOverSprite,
  loadLongAsciiLogo,
  drawSprite,
  drawBooleanSprite,
  drawSpriteGradient,
  CACTUS_LARGE_DEFINITIONS,
  CACTUS_SMALL_DEFINITIONS,
  LETTER_WIDTH,
  LETTER_HEIGHT,
  LETTER_Y,
  GAME_OVER_INDICES,
  DIGIT_WIDTH,
  DIGIT_HEIGHT,
  DIGIT_Y,
  HI_TEXT_RECT,
  type Sprite,
  checkCollision,
  COLOR_GRAY,
} from './graphics.js';

// Resolution: 4 dots per line vertically, 2 dots per char horizontally.
// Increased height to allow camera to scroll up without clipping at 0.
const HEIGHT = 150;
const GROUND_Y = HEIGHT - 4;
const DINO_X = 10;

// Dino sprite constants
const DINO_WIDTH = 44;
const DINO_HEIGHT = 23;
const POSE_START = 0;
const POSE_BLINK = 44;
const POSE_RUN1 = 88;
const POSE_RUN2 = 132;
const POSE_DEAD = 176;
// const POSE_DEAD2 = 110; // Unused for now

// Physics adjusted for higher resolution
const GRAVITY = 0.75;
const JUMP_VELOCITY = -8.485;
const SPEED_INITIAL = 5;
const MAX_SPEED = 15;
const SPEED_ACCELERATION = 0.005;
const INITIAL_GROUND_OFFSET = 600;

function calculateViewportY(
  dinoY: number,
  gameHeight: number,
  viewportHeightDots: number,
): number {
  // Default to showing the bottom (ground)
  let viewportY = gameHeight - viewportHeightDots;

  // Ensure dino is visible with padding (approx 1 char = 2 dots padding above)
  const dinoTop = dinoY;
  const requiredTop = dinoTop - 4; // 2 chars padding
  if (viewportY > requiredTop) {
    viewportY = Math.max(0, requiredTop);
  }

  // Ensure we don't go past the bottom
  viewportY = Math.min(viewportY, gameHeight - viewportHeightDots);

  return Math.floor(viewportY);
}

interface Obstacle {
  x: number;
  y: number;
  type: 'CACTUS_SMALL' | 'CACTUS_LARGE' | 'PTERODACTYL';
  sprite: boolean[][] | Sprite;
  width: number;
  height: number;
  srcX?: number;
  srcY?: number;
}

interface Cloud {
  x: number;
  y: number;
}

interface Logo {
  x: number;
  y: number;
  sprite: Sprite;
}

interface DinoGameProps {
  onClose?: () => void;
  availableHeight?: number;
}

export function DinoGame({ onClose, availableHeight }: DinoGameProps) {
  const { columns, rows: height } = useTerminalSize();

  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [clouds, setClouds] = useState<Cloud[]>([]);
  const [logos, setLogos] = useState<Logo[]>([]);
  const [groundOffset, setGroundOffset] = useState(INITIAL_GROUND_OFFSET);

  const [gameState, setGameState] = useState<
    'LOADING' | 'WAITING' | 'PLAYING' | 'GAME_OVER'
  >('LOADING');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [dinoY, setDinoY] = useState(0);
  const [dinoVy, setDinoVy] = useState(0);
  const [tick, setTick] = useState(0);

  const [dinoSprite, setDinoSprite] = useState<Sprite | null>(null);
  const [pteroSprite, setPteroSprite] = useState<Sprite | null>(null);
  const [cloudSprite, setCloudSprite] = useState<Sprite | null>(null);
  const [duckLeftSprite, setDuckLeftSprite] = useState<Sprite | null>(null);
  const [duckRightSprite, setDuckRightSprite] = useState<Sprite | null>(null);
  const [obstacleLargeSprite, setObstacleLargeSprite] = useState<Sprite | null>(
    null,
  );
  const [obstacleSmallSprite, setObstacleSmallSprite] = useState<Sprite | null>(
    null,
  );

  const speedRef = useRef(SPEED_INITIAL);
  const lastSpawnTickRef = useRef(0);
  const lastPteroSpawnTickRef = useRef(0);
  const gameTickRef = useRef(0);
  const duckTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [horizonSprite, setHorizonSprite] = useState<Sprite | null>(null);

  const [isDucking, setIsDucking] = useState(false);
  const [speedMode, setSpeedMode] = useState<'NORMAL' | 'SLOW' | 'VERY_SLOW'>(
    'NORMAL',
  );
  const [showBorder, setShowBorder] = useState(true);
  const [infiniteMode, setInfiniteMode] = useState(false);

  const width = (columns - (showBorder ? 2 : 0)) * 2;
  const effectiveHeightChars = availableHeight ?? height;

  const gameOverTimeRef = useRef(0);
  const lastCollisionTimeRef = useRef(0);
  const viewportYRef = useRef(0);
  const lastDuckSpriteRef = useRef<Sprite | null>(null);
  const [gameOverSprite, setGameOverSprite] = useState<Sprite | null>(null);
  const [logoSprites, setLogoSprites] = useState<Sprite[]>([]);
  const [debugCactusIndex, setDebugCactusIndex] = useState(0);

  const latestStateRef = useRef({
    gameState,
    dinoY,
    dinoVy,
    tick,
    isDucking,
    speedMode,
    infiniteMode,
    logoSprites,
    dinoSprite,
    pteroSprite,
    cloudSprite,
    duckLeftSprite,
    duckRightSprite,
    obstacleLargeSprite,
    obstacleSmallSprite,
    obstacles,
    clouds,
    logos,
    score,
    width,
    effectiveHeightChars,
    debugCactusIndex,
    onClose,
    viewportHeightDots: 0,
  });

  // Recreate engine when width changes
  const engine = useMemo(() => new GraphicsEngine(width, HEIGHT), [width]);

  // Viewport calculation
  // Max 70% of available height
  const maxViewportHeightChars = Math.floor(effectiveHeightChars * 0.7);
  const maxViewportHeightDots = maxViewportHeightChars * 2;
  const viewportHeightDots = Math.min(HEIGHT, maxViewportHeightDots);

  const viewportY = calculateViewportY(dinoY, HEIGHT, viewportHeightDots);
  viewportYRef.current = viewportY;

  latestStateRef.current = {
    gameState,
    dinoY,
    dinoVy,
    tick,
    isDucking,
    speedMode,
    infiniteMode,
    logoSprites,
    dinoSprite,
    pteroSprite,
    cloudSprite,
    duckLeftSprite,
    duckRightSprite,
    obstacleLargeSprite,
    obstacleSmallSprite,
    obstacles,
    clouds,
    logos,
    score,
    width,
    effectiveHeightChars,
    debugCactusIndex,
    onClose,
    viewportHeightDots,
  };

  useEffect(() => {
    debugState.debugNumAnimatedComponents++;
    return () => {
      debugState.debugNumAnimatedComponents--;
      if (duckTimerRef.current) clearTimeout(duckTimerRef.current);
    };
  }, []);

  useEffect(() => {
    Promise.all([
      loadDinoSprite(),
      loadPterodactylSprite(),
      loadCloudSprite(),
      loadDinoDuckLeftSprite(),
      loadDinoDuckRightSprite(),
      loadObstacleLargeSprite(),
      loadObstacleSmallSprite(),
      loadHorizonSprite(),
      loadGameOverSprite(),
      loadLongAsciiLogo(),
    ])
      .then(
        ([
          dino,
          ptero,
          cloud,
          duckL,
          duckR,
          obsLarge,
          obsSmall,
          horizon,
          gameOver,
          longLogo,
        ]) => {
          setDinoSprite(dino);
          setPteroSprite(ptero);
          setCloudSprite(cloud);
          setDuckLeftSprite(duckL);
          setDuckRightSprite(duckR);
          setObstacleLargeSprite(obsLarge);
          setObstacleSmallSprite(obsSmall);
          setHorizonSprite(horizon);
          setGameOverSprite(gameOver);
          setLogoSprites([longLogo]);
          setDinoY(GROUND_Y - dino.height);
          // Initial clouds
          setClouds([
            { x: 60, y: 30 },
            { x: 140, y: 60 },
          ]);
          setGameState('WAITING');
        },
      )
      .catch((err) => {
        console.error('Failed to load sprites', err);
      });
  }, []);

  const resetGame = useCallback(() => {
    const state = latestStateRef.current;
    if (!state.dinoSprite) return;
    setGameState('PLAYING');
    setScore(0);
    setDinoY(GROUND_Y - state.dinoSprite.height);
    setDinoVy(0);
    setObstacles([]);
    setClouds([
      { x: Math.floor((state.width * 0.3) / 2) * 2, y: 30 },
      { x: Math.floor((state.width * 0.7) / 2) * 2, y: 60 },
    ]);
    setLogos([]);
    setGroundOffset(INITIAL_GROUND_OFFSET);
    setTick(0);
    speedRef.current = SPEED_INITIAL;
    lastSpawnTickRef.current = 0;
    lastPteroSpawnTickRef.current = 0;
    gameTickRef.current = 0;
  }, []);

  const continueGame = useCallback(() => {
    setGameState('PLAYING');
    // Remove obstacles near the dino to prevent immediate re-collision
    setObstacles((prev) =>
      prev.filter((o) => o.x < DINO_X - 100 || o.x > DINO_X + 300),
    );
  }, []);

  const spawnPterodactyl = useCallback(() => {
    const state = latestStateRef.current;
    const pteroSprite = state.pteroSprite;
    if (!pteroSprite) return;
    // Pterodactyl should be duckable.
    // GROUND_Y is 86. Dino standing top is ~63. Ducking top is ~71.
    // Ptero height is 19.
    // Spawning at 86 - 36 = 50. Bottom is 50 + 19 = 69.
    // Hits standing (69 > 63), misses ducking (69 < 71).
    const y = GROUND_Y - 36;
    setObstacles((prev) => [
      ...prev,
      {
        x: state.width,
        y,
        type: 'PTERODACTYL',
        sprite: pteroSprite,
        width: pteroSprite.width,
        height: pteroSprite.height,
      },
    ]);
  }, []);

  const savedKeypressHandler = useRef<(key: Key) => void>(() => {});
  useEffect(() => {
    savedKeypressHandler.current = (key) => {
      const state = latestStateRef.current;
      const input = key.sequence;
      const upArrow = key.name === 'up';
      const downArrow = key.name === 'down';
      const ctrl = key.ctrl;

      if (state.gameState === 'WAITING') {
        if (input === ' ' || upArrow) {
          resetGame();
        }
      } else if (state.gameState === 'PLAYING') {
        if (
          (input === ' ' || upArrow) &&
          state.dinoSprite &&
          !state.isDucking &&
          (state.dinoY >= GROUND_Y - state.dinoSprite.height - 1 ||
            state.speedMode !== 'NORMAL')
        ) {
          setDinoVy(JUMP_VELOCITY);
        }
        // setIsDucking(!!downArrow); // Old logic was this, but we added timeout.

        if (downArrow) {
          setIsDucking(true);
          if (duckTimerRef.current) clearTimeout(duckTimerRef.current);
          duckTimerRef.current = setTimeout(() => {
            setIsDucking(false);
          }, 500);
        } else if (state.isDucking) {
          // If any other key is pressed, unduck
          setIsDucking(false);
          if (duckTimerRef.current) clearTimeout(duckTimerRef.current);
        }

        if (input === 'p') {
          spawnPterodactyl();
        }

        if (input === 'g' && state.logoSprites.length > 0) {
          const randomLogo =
            state.logoSprites[
              Math.floor(Math.random() * state.logoSprites.length)
            ];
          // Spawn in top half of visible area
          const minY = viewportYRef.current + 5;
          const maxY = Math.max(
            minY,
            viewportYRef.current + state.viewportHeightDots * 0.5,
          );
          const spawnY = Math.floor(Math.random() * (maxY - minY + 1)) + minY;

          setLogos((prev) => [
            ...prev,
            {
              x: state.width,
              y: spawnY,
              sprite: randomLogo,
            },
          ]);
        }

        if (input === 's') {
          setSpeedMode((prev) => (prev === 'SLOW' ? 'NORMAL' : 'SLOW'));
        }

        if (input === 'v') {
          setSpeedMode((prev) =>
            prev === 'VERY_SLOW' ? 'NORMAL' : 'VERY_SLOW',
          );
        }

        if (input === 'b') {
          setShowBorder((prev) => !prev);
        }

        if (input === 'i') {
          setInfiniteMode((prev) => !prev);
        }

        if (input === 'c' && state.obstacleSmallSprite) {
          // Debug spawn specific small cactus
          const def = CACTUS_SMALL_DEFINITIONS[state.debugCactusIndex];
          setObstacles((prev) => [
            ...prev,
            {
              x: state.width,
              y: GROUND_Y - def.h,
              width: def.w,
              height: def.h,
              type: 'CACTUS_SMALL',
              sprite: state.obstacleSmallSprite!,
              srcX: def.x,
              srcY: def.y,
            },
          ]);
          setDebugCactusIndex(
            (prev) => (prev + 1) % CACTUS_SMALL_DEFINITIONS.length,
          );
        }
      } else if (state.gameState === 'GAME_OVER') {
        if (
          (input === ' ' || upArrow) &&
          Date.now() - gameOverTimeRef.current > 2000
        ) {
          resetGame();
        }
        if (key.name === 'c' && !ctrl) {
          continueGame();
        }
      }

      if (
        (key.name === 'c' && ctrl) ||
        key.name === 'escape' ||
        key.sequence === '\x1b'
      ) {
        state.onClose?.();
      }
    };
  }, [resetGame, continueGame, spawnPterodactyl]);

  useKeypress(
    useCallback((key) => {
      savedKeypressHandler.current(key);
    }, []),
    { isActive: true },
  );

  useInterval(
    useCallback(() => {
      const state = latestStateRef.current;
      setTick((t) => t + 1);
      const currentTick = state.tick + 1;

      if (state.gameState === 'WAITING' || state.gameState === 'GAME_OVER') {
        return;
      }

      let timeScale = 1.0;
      if (state.speedMode === 'SLOW') timeScale = 0.5;
      else if (state.speedMode === 'VERY_SLOW') timeScale = 0.1;

      gameTickRef.current += timeScale;

      // PLAYING state updates
      setScore((s) => s + 1 * timeScale);
      setGroundOffset((prev) => prev + speedRef.current * timeScale);

      // Physics
      let newVy = state.dinoVy + GRAVITY * timeScale;
      let newY = state.dinoY + newVy * timeScale;
      const groundLevel = GROUND_Y - DINO_HEIGHT;
      if (newY > groundLevel) {
        newVy = 0;
        newY = groundLevel;
      }
      setDinoVy(newVy);
      setDinoY(newY);

      // Speed up
      speedRef.current = Math.min(
        MAX_SPEED,
        speedRef.current + SPEED_ACCELERATION * timeScale,
      );

      // Move obstacles
      const nextObstacles = state.obstacles
        .map((o) => {
          let moveSpeed = speedRef.current;
          if (o.type === 'PTERODACTYL') {
            moveSpeed = speedRef.current * 2;
          }
          return { ...o, x: o.x - moveSpeed * timeScale };
        })
        .filter((o) => o.x + o.width > 0);
      setObstacles(nextObstacles);

      // Move clouds
      let nextClouds = state.clouds;
      // Move slower and align to character grid (2px) to avoid shimmering
      if (currentTick % Math.round(8 / timeScale) === 0) {
        nextClouds = state.clouds
          .map((c) => ({
            ...c,
            x: c.x - 2, // Move 1 full character width
          }))
          .filter((c) => c.x + (state.cloudSprite?.width ?? 100) > 0);
        setClouds(nextClouds);
      }

      // Move logos (faster than clouds, e.g., 4x faster -> every 2 ticks)
      let nextLogos = state.logos;
      if (currentTick % Math.round(2 / timeScale) === 0) {
        nextLogos = state.logos
          .map((l) => ({
            ...l,
            x: l.x - 2,
          }))
          .filter((l) => l.x + l.sprite.width > 0);
        setLogos(nextLogos);
      }

      // Calculate current viewport for spawning
      const currentMaxViewportHeightChars = Math.floor(
        state.effectiveHeightChars * 0.7,
      );
      const currentMaxViewportHeightDots = currentMaxViewportHeightChars * 2;
      const currentViewportHeightDots = Math.min(
        HEIGHT,
        currentMaxViewportHeightDots,
      );
      const currentViewportY = calculateViewportY(
        newY, // Use new dino Y
        HEIGHT,
        currentViewportHeightDots,
      );

      // Spawn obstacles
      const timeSinceLastSpawn = currentTick - lastSpawnTickRef.current;
      const timeSinceLastPtero = currentTick - lastPteroSpawnTickRef.current;
      // Minimum distance depends on speed to ensure jumpable gaps
      const minDistance = Math.max(100, speedRef.current * 20);

      let spawnChance = 0.01 * timeScale;
      if (timeSinceLastSpawn > 60 / timeScale) spawnChance = 0.05 * timeScale;
      if (timeSinceLastSpawn > 150 / timeScale) spawnChance = 0.2 * timeScale;

      if (
        Math.random() < spawnChance &&
        nextObstacles.length < 3 &&
        (nextObstacles.length === 0 ||
          state.width - nextObstacles[nextObstacles.length - 1].x > minDistance)
      ) {
        const typeRand = Math.random();
        let type: Obstacle['type'];
        let sprite: boolean[][] | Sprite;
        let y: number;
        let obsW: number;
        let obsH: number;
        let srcX = 0;
        let srcY = 0;

        // Pterodactyls: target average of one every ~10s game time (300 game ticks)
        // Probability increases linearly, reaching 50% at 10s.
        const pteroChance = Math.min(
          0.8,
          (timeSinceLastPtero * timeScale) / 600,
        );
        const wantPtero = state.score > 300 && Math.random() < pteroChance;

        if (wantPtero && state.pteroSprite) {
          type = 'PTERODACTYL';
          sprite = state.pteroSprite;
          obsW = state.pteroSprite.width;
          obsH = state.pteroSprite.height;
          // Spawn at GROUND_Y - 36 (same as 'p' key), with +/- 4 dots variation (approx 2 rows total variation)
          y = GROUND_Y - 36 + (Math.random() * 8 - 4);
          lastPteroSpawnTickRef.current = currentTick;
        } else if (typeRand > 0.5 && state.obstacleLargeSprite) {
          type = 'CACTUS_LARGE';
          sprite = state.obstacleLargeSprite;
          const def =
            CACTUS_LARGE_DEFINITIONS[
              Math.floor(Math.random() * CACTUS_LARGE_DEFINITIONS.length)
            ];
          obsW = def.w;
          obsH = def.h;
          srcX = def.x;
          srcY = def.y;
          y = GROUND_Y - obsH;
        } else if (state.obstacleSmallSprite) {
          type = 'CACTUS_SMALL';
          sprite = state.obstacleSmallSprite;
          // Random small cactus
          const def =
            CACTUS_SMALL_DEFINITIONS[
              Math.floor(Math.random() * CACTUS_SMALL_DEFINITIONS.length)
            ];
          obsW = def.w;
          obsH = def.h;
          srcX = def.x;
          srcY = def.y;
          y = GROUND_Y - obsH;
        } else {
          return;
        }

        setObstacles((prev) => [
          ...prev,
          {
            x: state.width,
            y,
            type,
            sprite,
            width: obsW,
            height: obsH,
            srcX,
            srcY,
          },
        ]);
        lastSpawnTickRef.current = currentTick;
      }

      // Spawn clouds
      if (
        Math.random() < 0.3 * timeScale &&
        nextClouds.length < 4 &&
        state.cloudSprite
      ) {
        const cloudW = state.cloudSprite.width;
        const cloudH = state.cloudSprite.height;
        // Spawn in top 60% of viewport
        const minY = currentViewportY + 2;
        const maxY = Math.max(
          minY,
          currentViewportY + currentViewportHeightDots * 0.6,
        );
        const spawnY = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
        const spawnX = state.width;

        // Check overlap with existing clouds
        const overlaps = nextClouds.some(
          (c) =>
            spawnX < c.x + cloudW &&
            spawnX + cloudW > c.x &&
            spawnY < c.y + cloudH &&
            spawnY + cloudH > c.y,
        );

        if (!overlaps) {
          setClouds((prev) => [...prev, { x: spawnX, y: spawnY }]);
        }
      }

      // Spawn logos
      if (
        Math.random() < 0.02 * timeScale &&
        nextLogos.length < 3 &&
        state.logoSprites.length > 0 &&
        (nextLogos.length === 0 ||
          state.width - nextLogos[nextLogos.length - 1].x > state.width / 2)
      ) {
        const sprite =
          state.logoSprites[
            Math.floor(Math.random() * state.logoSprites.length)
          ];
        // Spawn in top half of viewport
        const minY = currentViewportY + 5;
        const maxY = Math.max(
          minY,
          currentViewportY + currentViewportHeightDots * 0.5,
        );
        const spawnY = Math.floor(Math.random() * (maxY - minY + 1)) + minY;

        setLogos((prev) => [
          ...prev,
          {
            x: state.width,
            y: spawnY,
            sprite,
          },
        ]);
      }

      // Collision detection
      if (!state.dinoSprite || !state.duckLeftSprite || !state.duckRightSprite)
        return;

      // Determine current dino state for collision
      let curDinoSprite = state.dinoSprite;
      let curDinoSrcX = 0;
      let curDinoW = DINO_WIDTH;
      let curDinoH = DINO_HEIGHT;
      let curDinoY = newY; // Use new Y

      if (state.isDucking) {
        curDinoSprite =
          Math.floor(gameTickRef.current / 3) % 2 === 0
            ? state.duckLeftSprite
            : state.duckRightSprite;
        curDinoW = curDinoSprite.width;
        curDinoH = curDinoSprite.height;
        curDinoY = newY + DINO_HEIGHT - curDinoH;
      } else {
        if (newY < GROUND_Y - DINO_HEIGHT) {
          curDinoSrcX = POSE_START; // Jumping
        } else {
          curDinoSrcX =
            Math.floor(gameTickRef.current / 3) % 2 === 0
              ? POSE_RUN1
              : POSE_RUN2;
        }
      }

      // Broad phase (bounding box) then narrow phase (pixel perfect)
      let collisionDetected = false;
      const isInvincible =
        state.infiniteMode && Date.now() - lastCollisionTimeRef.current < 3000;

      if (!isInvincible) {
        for (const obs of nextObstacles) {
          // Broad phase
          if (
            DINO_X < obs.x + obs.width &&
            DINO_X + curDinoW > obs.x &&
            curDinoY < obs.y + obs.height &&
            curDinoY + curDinoH > obs.y
          ) {
            // Narrow phase
            if (
              !Array.isArray(obs.sprite) && // Ensure it's a Sprite, not boolean[][]
              checkCollision(
                curDinoSprite,
                DINO_X,
                curDinoY,
                curDinoW,
                curDinoH,
                curDinoSrcX,
                0, // srcY for dino is always 0
                obs.sprite as Sprite,
                obs.x,
                obs.y,
                obs.width,
                obs.height,
                obs.srcX || 0,
                obs.srcY || 0,
              )
            ) {
              collisionDetected = true;
              break;
            }
          }
        }
      }

      if (collisionDetected) {
        if (state.infiniteMode) {
          lastCollisionTimeRef.current = Date.now();
        } else {
          setGameState('GAME_OVER');
          setHighScore((prev) => Math.max(prev, state.score));
          gameOverTimeRef.current = Date.now();
        }
      }
    }, []),
    gameState === 'LOADING' || !dinoSprite ? null : 33,
  );

  const renderedHeightChars = Math.ceil(viewportHeightDots / 2);

  const useSpriteScore =
    effectiveHeightChars >= 50 && width > 280 && gameOverSprite;
  const showHiScoreSprite = useSpriteScore;

  // Rendering
  engine.clear();
  const ctx = engine.ctx;
  let overlayText = '';

  if (gameState === 'LOADING') {
    return (
      <Box
        borderStyle="round"
        width={columns}
        height={Math.ceil(HEIGHT / 2) + 2}
        alignItems="center"
        justifyContent="center"
      >
        <Text>Loading...</Text>
      </Box>
    );
  }

  // Clouds (drawn first so they are behind)
  if (cloudSprite) {
    let scoreRect: { x: number; y: number; w: number; h: number } | null = null;
    if (useSpriteScore && gameOverSprite) {
      // Calculate score area to avoid clouds
      // Total width approx: 10*DIGIT_WIDTH + 14 + HI_TEXT_RECT.w
      // If only showing current score: 5*DIGIT_WIDTH
      const scoreWidth = showHiScoreSprite
        ? 10 * DIGIT_WIDTH + 14 + HI_TEXT_RECT.w
        : 5 * DIGIT_WIDTH;

      scoreRect = {
        x: width - 2 - scoreWidth,
        y: viewportY,
        w: scoreWidth,
        h: DIGIT_HEIGHT,
      };
    }

    clouds.forEach((c) => {
      // Only draw if visible in viewport AND not overlapping score
      if (
        c.x + cloudSprite.width > 0 &&
        c.x < width &&
        c.y + cloudSprite.height > viewportY &&
        c.y < viewportY + viewportHeightDots
      ) {
        if (
          scoreRect &&
          c.x < scoreRect.x + scoreRect.w &&
          c.x + cloudSprite.width > scoreRect.x &&
          c.y < scoreRect.y + scoreRect.h &&
          c.y + cloudSprite.height > scoreRect.y
        ) {
          return; // Skip drawing if overlaps score
        }

        drawSprite(
          ctx,
          cloudSprite,
          Math.floor(c.x),
          c.y,
          0,
          0,
          cloudSprite.width,
          cloudSprite.height,
          COLOR_GRAY,
        );
      }
    });
  }

  // Ground (Horizon)
  if (horizonSprite) {
    const horizonY = GROUND_Y - horizonSprite.height + 4; // Adjust vertical placement
    // Snap to 2px grid to avoid jitter relative to obstacles
    let sourceX = (Math.round(groundOffset / 2) * 2) % horizonSprite.width;

    // Draw first segment
    let destX = 0;
    let drawWidth = Math.min(width, horizonSprite.width - sourceX);

    drawSprite(
      ctx,
      horizonSprite,
      destX,
      horizonY,
      sourceX,
      0,
      drawWidth,
      horizonSprite.height,
    );

    // Draw second segment if needed to fill screen
    if (drawWidth < width) {
      destX += drawWidth;
      sourceX = 0;
      drawWidth = width - destX;
      // Potentially need multiple loops if screen is wider than horizon sprite (unlikely but good to be safe)
      while (drawWidth > 0) {
        const chunkW = Math.min(drawWidth, horizonSprite.width);
        drawSprite(
          ctx,
          horizonSprite,
          destX,
          horizonY,
          0,
          0,
          chunkW,
          horizonSprite.height,
        );
        destX += chunkW;
        drawWidth -= chunkW;
      }
    }
  } else {
    // Fallback procedural ground if sprite fails
    const HORIZON_Y = GROUND_Y - 5;
    for (let i = 0; i < width; i++) {
      const pos = i + Math.floor(groundOffset);
      const noise = ((pos * 9301 + 49297) % 233280) / 233280;
      if (noise > 0.98) {
        ctx.fillRect(i, HORIZON_Y + 2, 2, 1);
      } else {
        ctx.fillRect(i, HORIZON_Y, 1, 1);
      }
    }
  }

  // Logos (with gradient)
  logos.forEach((l) => {
    // Simple visibility check - similar to clouds but less strict on score overlap for now
    if (
      l.x + l.sprite.width > 0 &&
      l.x < width &&
      l.y + l.sprite.height > viewportY &&
      l.y < viewportY + viewportHeightDots
    ) {
      drawSpriteGradient(ctx, l.sprite, Math.floor(l.x), l.y);
    }
  });

  // Obstacles
  obstacles.forEach((o) => {
    if (
      o.x + o.width < 0 ||
      o.x > width ||
      o.y + o.height < viewportY ||
      o.y > viewportY + viewportHeightDots
    ) {
      return;
    }

    if (
      Array.isArray(o.sprite) &&
      Array.isArray(o.sprite[0]) &&
      typeof o.sprite[0][0] === 'boolean'
    ) {
      drawBooleanSprite(
        ctx,
        o.sprite as boolean[][],
        Math.round(o.x / 2) * 2,
        Math.round(o.y / 2) * 2,
      );
    } else {
      // It's a Sprite
      drawSprite(
        ctx,
        o.sprite as Sprite,
        Math.round(o.x / 2) * 2,
        Math.round(o.y / 2) * 2,
        o.srcX || 0,
        o.srcY || 0,
        o.width,
        o.height,
      );
    }
  });

  // Dino
  if (dinoSprite && duckLeftSprite && duckRightSprite) {
    // Only draw if visible in viewport
    if (
      DINO_X + DINO_WIDTH > 0 &&
      DINO_X < width &&
      dinoY + DINO_HEIGHT > viewportY &&
      dinoY < viewportY + viewportHeightDots
    ) {
      const isInvincible =
        infiniteMode && Date.now() - lastCollisionTimeRef.current < 3000;
      // Blink every 4th tick (approx 130ms)
      const shouldDraw =
        !isInvincible || Math.floor(Date.now() / 100) % 2 === 0;

      if (shouldDraw) {
        if (gameState === 'PLAYING' && isDucking) {
          const feetY = dinoY + DINO_HEIGHT;
          const isInAir = feetY < GROUND_Y - 0.1;
          let duckSprite =
            Math.floor(gameTickRef.current / 3) % 2 === 0
              ? duckLeftSprite
              : duckRightSprite;

          if (isInAir && lastDuckSpriteRef.current) {
            duckSprite = lastDuckSpriteRef.current;
          } else {
            lastDuckSpriteRef.current = duckSprite;
          }

          drawSprite(
            ctx,
            duckSprite,
            DINO_X,
            Math.floor(feetY - duckSprite.height),
          );
        } else {
          let srcX = POSE_START;
          if (gameState === 'WAITING') {
            const blinkCycle = Math.floor(gameTickRef.current) % 90;
            if (blinkCycle > 75) {
              srcX = POSE_BLINK;
            }
          } else if (gameState === 'PLAYING') {
            if (dinoY < GROUND_Y - DINO_HEIGHT) {
              srcX = POSE_START; // Jumping
            } else {
              srcX =
                Math.floor(gameTickRef.current / 3) % 2 === 0
                  ? POSE_RUN1
                  : POSE_RUN2;
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
      }
    }
  }

  if (gameState === 'GAME_OVER' && gameOverSprite) {
    // "GAME OVER" rendering
    const maxCols = 192;
    const maxDots = maxCols * 2;
    const targetWidth = Math.min(width - 4, maxDots);
    const totalLetterWidth = GAME_OVER_INDICES.length * LETTER_WIDTH;

    if (targetWidth >= totalLetterWidth) {
      // Enough space to render with sprites
      const totalGap = targetWidth - totalLetterWidth;
      // 8 gaps between 9 characters
      const gap = totalGap / (GAME_OVER_INDICES.length - 1);
      const startX = Math.floor((width - targetWidth) / 2);
      // Center in viewport initially
      let startY = Math.floor(
        viewportY + viewportHeightDots / 2 - LETTER_HEIGHT / 2,
      );

      // Check for overlap with Dino and adjust if necessary
      const dinoR = DINO_X + DINO_WIDTH;
      const textR = startX + targetWidth;
      const overlapX = DINO_X < textR && dinoR > startX;

      if (overlapX) {
        const dinoB = dinoY + DINO_HEIGHT;
        const textB = startY + LETTER_HEIGHT;
        const overlapY = dinoY < textB && dinoB > startY;

        if (overlapY) {
          // Try positioning above the dino with some padding
          const aboveY = Math.floor(dinoY - LETTER_HEIGHT - 4);
          // Ensure it doesn't go off the top of the viewport
          if (aboveY >= viewportY) {
            startY = aboveY;
          }
        }
      }

      GAME_OVER_INDICES.forEach((letterIdx, i) => {
        if (letterIdx !== -1) {
          drawSprite(
            ctx,
            gameOverSprite,
            Math.floor(startX + i * (LETTER_WIDTH + gap)),
            startY,
            letterIdx * LETTER_WIDTH,
            LETTER_Y,
            LETTER_WIDTH,
            LETTER_HEIGHT,
          );
        }
        // If it's a space (-1), we just skip drawing but it takes up space in the loop
      });
    } else {
      // Fallback to text overlay if not enough space
      overlayText = 'GAME OVER';
    }
  }

  // Text overlay
  if (gameState === 'WAITING') {
    overlayText = 'Press Space to Play';
  }

  if (useSpriteScore && gameOverSprite) {
    // Draw score using sprites
    const scoreY = viewportY; // Moved up by 4 dots (was viewportY + 4)
    let drawX = width - 2;

    // Current score
    let curScore = Math.floor(score);
    for (let i = 0; i < 5; i++) {
      const digit = curScore % 10;
      drawX -= DIGIT_WIDTH;
      drawSprite(
        ctx,
        gameOverSprite,
        drawX,
        scoreY,
        digit * DIGIT_WIDTH,
        DIGIT_Y,
        DIGIT_WIDTH,
        DIGIT_HEIGHT,
      );
      curScore = Math.floor(curScore / 10);
    }

    if (showHiScoreSprite) {
      // Space between score and HI
      drawX -= 10; // Reduced from 20

      // HI score
      let curHi = Math.floor(highScore);
      for (let i = 0; i < 5; i++) {
        const digit = curHi % 10;
        drawX -= DIGIT_WIDTH;
        drawSprite(
          ctx,
          gameOverSprite,
          drawX,
          scoreY,
          digit * DIGIT_WIDTH,
          DIGIT_Y,
          DIGIT_WIDTH,
          DIGIT_HEIGHT,
          COLOR_GRAY, // Draw HI score in gray? Or default? Original is gray-ish for HI sometimes.
        );
        curHi = Math.floor(curHi / 10);
      }

      // "HI" text
      drawX -= HI_TEXT_RECT.w + 5; // Increased padding from 4 to 5
      drawSprite(
        ctx,
        gameOverSprite,
        drawX,
        scoreY,
        HI_TEXT_RECT.x,
        HI_TEXT_RECT.y,
        HI_TEXT_RECT.w,
        HI_TEXT_RECT.h,
        COLOR_GRAY,
      );
    }
  }

  return (
    <Box
      flexDirection="column"
      width={columns}
      borderStyle={showBorder ? 'round' : undefined}
    >
      {!showBorder && (
        <Box
          width={columns}
          height={1}
          borderStyle="single"
          borderLeft={false}
          borderRight={false}
          borderBottom={false}
          borderTop={true}
        />
      )}
      <Box justifyContent="space-between" flexWrap="wrap">
        <Text color="gray"> Press Ctrl+C to quit</Text>
        <Box paddingRight={1}>
          <Text>
            {!showHiScoreSprite && (
              <Text color="gray">
                HI {String(Math.floor(highScore)).padStart(5, '0')}{' '}
              </Text>
            )}
            {!useSpriteScore && String(Math.floor(score)).padStart(5, '0')}
          </Text>
        </Box>
      </Box>
      <Box
        height={renderedHeightChars}
        flexDirection="column"
        overflow="hidden" // Ensure no spillover if calculations are slightly off
      >
        <Box
          flexDirection="column"
          width={columns + 20}
          flexShrink={0}
          overflow="hidden"
        >
          {engine
            .toLines(viewportY, viewportY + viewportHeightDots)
            .map((line, i) => (
              <Text key={i} wrap="truncate">
                {line}
              </Text>
            ))}
        </Box>
        {overlayText && (
          <Box
            position="absolute"
            width="100%"
            height="100%"
            alignItems="center"
            justifyContent="center"
          >
            <Text> {overlayText} </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
