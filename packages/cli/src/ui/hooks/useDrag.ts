import { useState, useEffect } from 'react';
import { useInput } from 'ink';

export const useDrag = (ref) => {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useInput((input, key) => {
    if (isDragging) {
      if (key.leftArrow) {
        setPosition((prev) => ({ ...prev, x: prev.x - 1 }));
      }
      if (key.rightArrow) {
        setPosition((prev) => ({ ...prev, x: prev.x + 1 }));
      }
      if (key.upArrow) {
        setPosition((prev) => ({ ...prev, y: prev.y - 1 }));
      }
      if (key.downArrow) {
        setPosition((prev) => ({ ...prev, y: prev.y + 1 }));
      }
    }
  });

  const onMouseDown = () => {
    setIsDragging(true);
  };

  const onMouseUp = () => {
    setIsDragging(false);
  };

  return { isDragging, position, onMouseDown, onMouseUp };
};
