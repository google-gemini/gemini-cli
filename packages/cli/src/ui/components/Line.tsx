import React from 'react';
import { Box } from 'ink';
import bresenham from 'bresenham-js';

const Line = ({ x1, y1, x2, y2 }) => {
  const points = bresenham(x1, y1, x2, y2);

  return (
    <>
      {points.map((point, index) => (
        <Box
          key={index}
          position="absolute"
          left={point.x}
          top={point.y}
          width={1}
          height={1}
          backgroundColor="white"
        />
      ))}
    </>
  );
};

export default Line;
