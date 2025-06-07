/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Single edit operation with position information
 */
export interface PositionedEdit {
  /**
   * Original edit operation
   */
  original: EditOperation;

  /**
   * Index in the original edits array
   */
  index: number;

  /**
   * Start position in the file content
   */
  startPos: number;

  /**
   * End position in the file content
   */
  endPos: number;

  /**
   * The replacement text
   */
  newString: string;
}

/**
 * Result of failed edit with reason
 */
export interface FailedEdit {
  index: number;
  edit: EditOperation;
  reason: 'not_found' | 'multiple_matches' | 'empty_old_string';
}

/**
 * Result of position-based edit processing
 */
export interface PositionBasedEditResult {
  finalContent: string;
  appliedEdits: PositionedEdit[];
  failedEdits: FailedEdit[];
}

/**
 * Edit operation interface (matches existing EditOperation)
 */
export interface EditOperation {
  old_string: string;
  new_string: string;
}

/**
 * Efficient position-based edit processor that minimizes memory usage
 * and applies edits in optimal order to prevent position conflicts.
 */
export class PositionBasedEditProcessor {
  /**
   * Process edits with minimal memory usage and optimal ordering
   */
  processEdits(
    content: string,
    edits: EditOperation[],
  ): PositionBasedEditResult {
    // Phase 1: Find positions for all edits
    const { validEdits, failedEdits } = this.analyzeEdits(content, edits);

    // Phase 2: Sort by position (highest first) to prevent position drift
    const sortedEdits = validEdits.sort((a, b) => b.startPos - a.startPos);

    // Phase 3: Build final content in single pass
    const finalContent = this.buildFinalContent(content, sortedEdits);

    return {
      finalContent,
      appliedEdits: sortedEdits,
      failedEdits,
    };
  }

  /**
   * Analyze all edits and categorize into valid/failed
   */
  private analyzeEdits(
    content: string,
    edits: EditOperation[],
  ): {
    validEdits: PositionedEdit[];
    failedEdits: FailedEdit[];
  } {
    const validEdits: PositionedEdit[] = [];
    const failedEdits: FailedEdit[] = [];

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];

      // Handle empty old_string (file creation case)
      if (edit.old_string === '') {
        failedEdits.push({
          index: i,
          edit,
          reason: 'empty_old_string',
        });
        continue;
      }

      // Find all positions of old_string
      const positions = this.findAllPositions(content, edit.old_string);

      if (positions.length === 0) {
        failedEdits.push({
          index: i,
          edit,
          reason: 'not_found',
        });
      } else if (positions.length > 1) {
        failedEdits.push({
          index: i,
          edit,
          reason: 'multiple_matches',
        });
      } else {
        // Exactly one match - valid edit
        const startPos = positions[0];
        validEdits.push({
          original: edit,
          index: i,
          startPos,
          endPos: startPos + edit.old_string.length,
          newString: edit.new_string,
        });
      }
    }

    return { validEdits, failedEdits };
  }

  /**
   * Find all positions where searchString occurs in content
   */
  private findAllPositions(content: string, searchString: string): number[] {
    const positions: number[] = [];
    let index = content.indexOf(searchString);

    while (index !== -1) {
      positions.push(index);
      index = content.indexOf(searchString, index + 1);
    }

    return positions;
  }

  /**
   * Build final content in single pass with minimal memory allocation
   */
  private buildFinalContent(original: string, edits: PositionedEdit[]): string {
    if (edits.length === 0) {
      return original;
    }

    // Check for overlapping edits (should not happen with our validation, but safety check)
    if (this.hasOverlappingEdits(edits)) {
      throw new Error('Overlapping edits detected - this should not happen');
    }

    // Build segments array working backwards through the string
    const segments: string[] = [];
    let currentPos = original.length;

    // Process edits from end to beginning (edits are already sorted by startPos desc)
    for (const edit of edits) {
      // Add text after this edit position
      if (currentPos > edit.endPos) {
        segments.unshift(original.slice(edit.endPos, currentPos));
      }

      // Add the replacement text
      segments.unshift(edit.newString);

      // Update current position
      currentPos = edit.startPos;
    }

    // Add remaining text from beginning
    if (currentPos > 0) {
      segments.unshift(original.slice(0, currentPos));
    }

    // Single join operation creates final string
    return segments.join('');
  }

  /**
   * Check if any edits overlap (safety validation)
   */
  private hasOverlappingEdits(edits: PositionedEdit[]): boolean {
    for (let i = 0; i < edits.length - 1; i++) {
      for (let j = i + 1; j < edits.length; j++) {
        const edit1 = edits[i];
        const edit2 = edits[j];

        // Check if ranges overlap
        if (
          !(edit1.endPos <= edit2.startPos || edit2.endPos <= edit1.startPos)
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get human-readable error message for failed edit reason
   */
  static getErrorMessage(reason: FailedEdit['reason']): string {
    switch (reason) {
      case 'not_found':
        return 'Old string not found in current content';
      case 'multiple_matches':
        return 'Old string found multiple times - please be more specific';
      case 'empty_old_string':
        return 'Cannot use empty old_string on existing file';
      default:
        return 'Unknown error';
    }
  }
}
