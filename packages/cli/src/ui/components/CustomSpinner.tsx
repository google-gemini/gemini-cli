import React, { useState, useEffect } from 'react';
import { Text } from 'ink';
import { Colors } from '../colors.js';

const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
const interval = 80;

export const CustomSpinner: React.FC = () => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % frames.length);
    }, interval);
    return () => clearInterval(timer);
  }, []);

  return <Text color={Colors.GradientColors?.[2] || Colors.AccentCyan}>{String(frames[frame])}</Text>;
};

export default CustomSpinner; 