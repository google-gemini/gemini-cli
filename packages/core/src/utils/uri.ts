/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from "node:path";

/**
 * Converts a local file path to a file:// URI.
 */
export function pathToUri(filePath: string): string {
  let absolutePath = path.resolve(filePath).replace(/\\/g, "/");
  if (!absolutePath.startsWith("/")) {
    absolutePath = "/" + absolutePath;
  }
  return "file://" + absolutePath;
}

/**
 * Converts a file:// URI to a local file path.
 */
export function uriToPath(uri: string): string {
  if (!uri.startsWith("file://")) {
    return uri;
  }
  let decodedPath = decodeURIComponent(uri.substring(7));
  if (process.platform === "win32") {
    if (decodedPath.startsWith("/")) {
      decodedPath = decodedPath.substring(1);
    }
    return decodedPath.replace(/\//g, "\\");
  }
  return decodedPath;
}
