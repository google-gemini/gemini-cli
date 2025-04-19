import { useState, useEffect } from 'react';
import { useStdin } from 'ink';

export interface PipedInputState {
  data: string | null; // Use null initially to distinguish from empty string
  isLoading: boolean;
  error: string | null;
  isPiped: boolean; // Flag to indicate if input was piped
}

export function usePipedInput(): PipedInputState {
  const { stdin, setRawMode, isRawModeSupported } = useStdin();
  // Keep exit available if needed, e.g., for error handling, but maybe let consumer handle it
  // const { exit } = useApp();

  const [pipedData, setPipedData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Assume loading until checked
  const [error, setError] = useState<string | null>(null);
  const [isPiped, setIsPiped] = useState<boolean>(false);

  useEffect(() => {
    // Determine if input is piped ONLY ONCE
    const checkIsPiped = !stdin || !stdin.isTTY;
    setIsPiped(checkIsPiped);

    if (checkIsPiped) {
      // Piped input detected
      if (isRawModeSupported) {
        setRawMode(false); // Ensure raw mode is off for stream reading
      }

      // Ensure stdin is available (it should be if !isTTY)
      if (!stdin) {
        setError('Stdin stream is unavailable.');
        setIsLoading(false);
        return; // Cannot proceed
      }

      let data = '';
      const handleData = (chunk: Buffer) => {
        data += chunk.toString();
      };

      const handleError = (err: Error) => {
        setError('Error reading from stdin: ' + err.message);
        setIsLoading(false);
        // Decide if the hook should trigger exit or just report the error
        // exit();
      };

      const handleEnd = () => {
        setPipedData(data);
        setIsLoading(false);
        // Don't exit here, let the component using the hook decide
      };

      stdin.on('data', handleData);
      stdin.on('error', handleError);
      stdin.on('end', handleEnd);

      // Cleanup listeners
      return () => {
        stdin.removeListener('data', handleData);
        stdin.removeListener('error', handleError);
        stdin.removeListener('end', handleEnd);
      };
    } else {
      // No piped input (running interactively)
      setIsLoading(false);
      // Optionally set an 'info' state or just let isLoading=false & isPiped=false suffice
      // setError('No piped input detected.'); // Maybe don't treat this as an 'error'
    }

    // Intentionally run only once on mount or when stdin theoretically changes
  }, [stdin, isRawModeSupported, setRawMode /*, exit */]);

  return { data: pipedData, isLoading, error, isPiped };
}
