import { useState, useEffect } from 'react';
import { useStdin } from 'ink';

export const useMouse = () => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const { stdin, setRawMode } = useStdin();

  useEffect(() => {
    setRawMode(true);
    stdin.on('data', (data) => {
      const msg = data.toString('utf8');
      if (msg.startsWith('\x1b[M')) {
        const x = msg.charCodeAt(4) - 33;
        const y = msg.charCodeAt(5) - 33;
        setPosition({ x, y });
      }
    });
    return () => {
      setRawMode(false);
    };
  }, [stdin, setRawMode]);

  return position;
};
