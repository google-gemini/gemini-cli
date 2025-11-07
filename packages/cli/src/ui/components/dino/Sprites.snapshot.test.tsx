/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { render } from '../../../test-utils/render.js';
import { waitFor } from '../../../test-utils/async.js';
import { useEffect, useState, useMemo } from 'react';
import { Text, Box } from 'ink';
import {
  loadDinoSprite,
  loadPterodactylSprite,
  loadCloudSprite,
  loadDinoDuckLeftSprite,
  loadDinoDuckRightSprite,
  loadObstacleLargeSprite,
  loadObstacleSmallSprite,
  loadGameOverSprite,
  CACTUS_LARGE_DEFINITIONS,
  CACTUS_SMALL_DEFINITIONS,
  DIGIT_WIDTH,
  DIGIT_HEIGHT,
  DIGIT_Y,
  HI_TEXT_RECT,
  LETTER_WIDTH,
  LETTER_HEIGHT,
  LETTER_Y,
  type Sprite,
  GraphicsEngine,
  drawSprite,
} from './graphics.js';

const SingleSprite = ({
  sprite,
  x = 0,
  y = 0,
  w,
  h,
  label,
}: {
  sprite: Sprite;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  label: string;
}) => {
  const width = w || sprite.width;
  const height = h || sprite.height;
  const engine = useMemo(() => {
    const eng = new GraphicsEngine(width, height);
    drawSprite(eng.ctx, sprite, 0, 0, x, y, width, height);
    return eng;
  }, [sprite, x, y, width, height]);

  return (
    <Box flexDirection="column" marginRight={1} marginBottom={1}>
      <Text>{label}</Text>
      <Box borderStyle="single">
        <Text>{engine.toString()}</Text>
      </Box>
    </Box>
  );
};

const SpriteSheet = () => {
  const [sprites, setSprites] = useState<{
    dino: Sprite;
    ptero: Sprite;
    cloud: Sprite;
    duckL: Sprite;
    duckR: Sprite;
    obsLarge: Sprite;
    obsSmall: Sprite;
    gameOver: Sprite;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [dino, ptero, cloud, duckL, duckR, obsLarge, obsSmall, gameOver] =
        await Promise.all([
          loadDinoSprite(),
          loadPterodactylSprite(),
          loadCloudSprite(),
          loadDinoDuckLeftSprite(),
          loadDinoDuckRightSprite(),
          loadObstacleLargeSprite(),
          loadObstacleSmallSprite(),
          loadGameOverSprite(),
        ]);
      if (mounted) {
        setSprites({
          dino,
          ptero,
          cloud,
          duckL,
          duckR,
          obsLarge,
          obsSmall,
          gameOver,
        });
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (!sprites) return <Text>Loading sprites...</Text>;

  const { dino, ptero, cloud, duckL, duckR, obsLarge, obsSmall, gameOver } =
    sprites;
  const DINO_W = 44;
  const DINO_H = 23;

  return (
    <Box flexDirection="column">
      <Text bold>Dino Poses</Text>
      <Box flexDirection="row" flexWrap="wrap">
        <SingleSprite
          sprite={dino}
          x={0}
          y={0}
          w={DINO_W}
          h={DINO_H}
          label="Start"
        />
        <SingleSprite
          sprite={dino}
          x={44}
          y={0}
          w={DINO_W}
          h={DINO_H}
          label="Blink"
        />
        <SingleSprite
          sprite={dino}
          x={88}
          y={0}
          w={DINO_W}
          h={DINO_H}
          label="Run1"
        />
        <SingleSprite
          sprite={dino}
          x={132}
          y={0}
          w={DINO_W}
          h={DINO_H}
          label="Run2"
        />
        <SingleSprite
          sprite={dino}
          x={176}
          y={0}
          w={DINO_W}
          h={DINO_H}
          label="Dead"
        />
      </Box>

      <Text bold>Ducking</Text>
      <Box flexDirection="row">
        <SingleSprite sprite={duckL} label="Duck Left" />
        <SingleSprite sprite={duckR} label="Duck Right" />
      </Box>

      <Text bold>Pterodactyl</Text>
      <Box flexDirection="row">
        <SingleSprite sprite={ptero} label="Fly 1" w={46} />
        <SingleSprite sprite={ptero} x={46} label="Fly 2" w={46} />
      </Box>

      <Text bold>Cloud</Text>
      <SingleSprite sprite={cloud} label="Cloud" />

      <Text bold>Large Cacti (Scaled)</Text>
      <Box flexDirection="row" flexWrap="wrap">
        {CACTUS_LARGE_DEFINITIONS.map((def, i) => (
          <SingleSprite
            key={i}
            sprite={obsLarge}
            x={def.x}
            y={def.y}
            w={def.w}
            h={def.h}
            label={`L${i + 1}`}
          />
        ))}
      </Box>

      <Text bold>Small Cacti (Scaled)</Text>
      <Box flexDirection="row" flexWrap="wrap">
        {CACTUS_SMALL_DEFINITIONS.map((def, i) => (
          <SingleSprite
            key={i}
            sprite={obsSmall}
            x={def.x}
            y={def.y}
            w={def.w}
            h={def.h}
            label={`S${i + 1}`}
          />
        ))}
      </Box>

      <Text bold>Game Over - Digits</Text>
      <Box flexDirection="row" flexWrap="wrap">
        {Array.from({ length: 10 }).map((_, i) => (
          <SingleSprite
            key={i}
            sprite={gameOver}
            x={i * DIGIT_WIDTH}
            y={DIGIT_Y}
            w={DIGIT_WIDTH}
            h={DIGIT_HEIGHT}
            label={`${i}`}
          />
        ))}
      </Box>

      <Text bold>Game Over - HI</Text>
      <SingleSprite
        sprite={gameOver}
        x={HI_TEXT_RECT.x}
        y={HI_TEXT_RECT.y}
        w={HI_TEXT_RECT.w}
        h={HI_TEXT_RECT.h}
        label="HI"
      />

      <Text bold>Game Over - Letters</Text>
      <Box flexDirection="row" flexWrap="wrap">
        {/* G A M E O V E R (packed) */}
        {['G', 'A', 'M', 'E', 'O', 'V', 'E', 'R'].map((char, i) => (
          <SingleSprite
            key={i}
            sprite={gameOver}
            x={i * LETTER_WIDTH}
            y={LETTER_Y}
            w={LETTER_WIDTH}
            h={LETTER_HEIGHT}
            label={char}
          />
        ))}
      </Box>
    </Box>
  );
};

describe('Sprite Snapshots', () => {
  it('renders all sprites individually boxed', async () => {
    const { lastFrame } = render(<SpriteSheet />);
    await waitFor(() => {
      expect(lastFrame()).not.toContain('Loading sprites...');
    });
    expect(lastFrame()).toMatchSnapshot();
  });
});
