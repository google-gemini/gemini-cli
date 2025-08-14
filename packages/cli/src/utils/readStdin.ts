/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export async function readStdin(): Promise<string> {
  const MAX_STDIN_SIZE = 8 * 1024 * 1024; // 8MB
  return new Promise((resolve, reject) => {
    let data = '';
    let totalSize = 0;
    process.stdin.setEncoding('utf8');

    const onReadable = () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        if (totalSize + chunk.length > MAX_STDIN_SIZE) {
          const remainingSize = MAX_STDIN_SIZE - totalSize;
          data += chunk.slice(0, remainingSize);
          console.warn(
            `Warning: stdin input truncated to ${MAX_STDIN_SIZE} bytes.`,
          );
          process.stdin.destroy(); // Stop reading further
          break;
        }
        data += chunk;
        totalSize += chunk.length;
      }
    };

    const onEnd = () => {
      cleanup();
      resolve(data);
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      process.stdin.removeListener('readable', onReadable);
      process.stdin.removeListener('end', onEnd);
      process.stdin.removeListener('error', onError);
    };

    process.stdin.on('readable', onReadable);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onError);
  });
}
