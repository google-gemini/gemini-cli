/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, ChildProcess } from 'child_process';
import { GitState, CommitMode } from './types.js';
import { Logger } from './logger.js';

export class GitOperations {
  constructor(private readonly logger: Logger) {}

  async executeGitCommand(
    args: string[],
    signal: AbortSignal,
    stdin?: string,
  ): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const commandString = `git ${args.join(' ')}`;
      this.logger.debug(`Executing: ${commandString}`);
      
      if (signal.aborted) {
        reject(new Error(`Git command '${commandString}' was aborted before starting`));
        return;
      }
      
      try {
        const child = spawn('git', args, { signal, stdio: 'pipe' });
        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        this.handleStdinWrite(child, stdin, reject);
        this.handleProcessEvents(child, commandString, stdout, stderr, resolve, reject);
        
      } catch (error) {
        const errorMessage = `Failed to spawn git process: ${error instanceof Error ? error.message : String(error)}`;
        this.logger.error('Spawn setup error', { error: errorMessage });
        reject(new Error(errorMessage));
      }
    });
  }

  analyzeGitState(statusOutput: string, stagedDiff: string, unstagedDiff: string): GitState {
    const lines = statusOutput.split('\n').filter(line => line.trim());
    return {
      hasStagedChanges: stagedDiff.trim() !== '',
      hasUnstagedChanges: unstagedDiff.trim() !== '',
      hasUntrackedFiles: statusOutput.includes('??'),
      hasDeletedFiles: lines.some(line => line.includes(' D ') || line.includes('D ')),
      hasRenamedFiles: lines.some(line => line.includes(' R ') || line.includes('R ')),
      hasConflicts: lines.some(line => line.includes('UU') || line.includes('AA') || line.includes('DD') || line.includes('AU') || line.includes('UA')),
      modifiedFileCount: lines.filter(line => line.includes(' M ') || line.includes('M ')).length,
      addedFileCount: lines.filter(line => line.includes('A ') || line.includes(' A')).length,
      deletedFileCount: lines.filter(line => line.includes(' D ') || line.includes('D ')).length,
      untrackedFileCount: lines.filter(line => line.includes('??')).length,
      stagedFileCount: lines.filter(line => line.length >= 2 && line[0] !== ' ' && line[0] !== '?').length,
      unstagedFileCount: lines.filter(line => line.length >= 2 && line[1] !== ' ' && line[1] !== '?').length,
      totalChangedFiles: lines.length
    };
  }

  determineCommitStrategy(gitState: GitState): CommitMode {
    if (gitState.hasConflicts) {
      throw new Error('Git conflicts detected. Please resolve conflicts before committing.');
    }

    if (gitState.hasStagedChanges && !gitState.hasUnstagedChanges && !gitState.hasUntrackedFiles) {
      this.logger.debug('Only staged changes detected, will commit staged files only');
      return 'staged-only';
    }

    if (gitState.hasStagedChanges && (gitState.hasUnstagedChanges || gitState.hasUntrackedFiles)) {
      this.logger.debug('Both staged and unstaged changes detected, will commit staged files only for safety');
      return 'staged-only';
    }

    if (gitState.hasUnstagedChanges || gitState.hasUntrackedFiles) {
      this.logger.debug('No staged changes, will stage and commit all changes');
      return 'all-changes';
    }

    throw new Error('No changes detected to commit. Please stage changes or modify files first.');
  }

  parseFilesToBeCommitted(statusOutput: string, commitMode: CommitMode): string[] {
    const lines = statusOutput.split('\n').filter(line => line.trim());
    
    if (commitMode === 'staged-only') {
      return lines
        .filter(line => line.length >= 2 && line[0] !== ' ' && line[0] !== '?')
        .map(line => line.substring(3).trim())
        .filter(file => file.length > 0);
    } else {
      return lines
        .filter(line => line.trim() && !line.startsWith('##'))
        .map(line => line.substring(3).trim())
        .filter(file => file.length > 0);
    }
  }

  private handleStdinWrite(child: ChildProcess, stdin: string | undefined, reject: (error: Error) => void): void {
    if (stdin && child.stdin) {
      let isRejected = false;
      
      const safeReject = (error: Error) => {
        if (!isRejected) {
          isRejected = true;
          reject(error);
        }
      };
      
      child.stdin.on('error', (err: Error & { code?: string }) => {
        const errorMessage = this.formatStdinError(err);
        this.logger.error('stdin write error', { error: errorMessage });
        safeReject(new Error(errorMessage));
      });
      
      try {
        const writePromise = new Promise<void>((resolve, writeReject) => {
          if (!child.stdin) {
            writeReject(new Error('stdin stream is not available'));
            return;
          }
          
          let isResolved = false;
          
          const safeResolve = () => {
            if (!isResolved) {
              isResolved = true;
              resolve();
            }
          };
          
          const safeWriteReject = (error: Error) => {
            if (!isResolved) {
              isResolved = true;
              writeReject(error);
            }
          };
          
          const writeResult = child.stdin.write(stdin, (writeError) => {
            if (writeError) {
              const errorMessage = this.formatStdinWriteError(writeError as Error & { code?: string });
              this.logger.error('Stdin write callback error', { error: errorMessage });
              safeWriteReject(new Error(errorMessage));
            } else {
              safeResolve();
            }
          });
          
          if (!writeResult) {
            child.stdin.once('drain', safeResolve);
          } else {
            safeResolve();
          }
        });
        
        writePromise
          .then(() => {
            if (child.stdin && !child.stdin.destroyed) {
              child.stdin.end();
            }
          })
          .catch((writeError) => {
            const errorMessage = writeError instanceof Error ? writeError.message : String(writeError);
            this.logger.error('Stdin write promise error', { error: errorMessage });
            safeReject(new Error(errorMessage));
          });
      } catch (stdinError) {
        const errorMessage = this.formatStdinWriteError(stdinError as Error & { code?: string });
        this.logger.error('Stdin write error', { error: errorMessage });
        safeReject(new Error(errorMessage));
      }
    }
  }

  private handleProcessEvents(
    child: ChildProcess,
    commandString: string,
    stdout: string,
    stderr: string,
    resolve: (value: string | null) => void,
    reject: (error: Error) => void
  ): void {
    child.on('close', (exitCode: number) => {
      if (exitCode !== 0) {
        const errorMessage = this.formatGitError(commandString.split(' ').slice(1), exitCode ?? -1, stderr);
        this.logger.error('Command failed', { command: commandString, error: errorMessage });
        reject(new Error(errorMessage));
      } else {
        this.logger.debug('Command succeeded', { command: commandString });
        resolve(stdout.trim() || null);
      }
    });

    child.on('error', (err: Error & { code?: string }) => {
      const errorMessage = this.formatSpawnError(commandString, err);
      this.logger.error('Spawn error', { error: errorMessage });
      reject(new Error(errorMessage));
    });
  }

  private formatStdinError(err: Error & { code?: string }): string {
    if (err.code === 'EPIPE') {
      return 'Broken pipe (process ended before stdin could be written)';
    }
    return `stdin stream error: ${err.message} (code: ${err.code || 'unknown'})`;
  }

  private formatStdinWriteError(err: Error & { code?: string }): string {
    if (err.code === 'EPIPE') {
      return 'Cannot write to stdin: process already closed';
    }
    return `Failed to write to stdin: ${err.message} (code: ${err.code || 'unknown'})`;
  }

  private formatGitError(args: string[], exitCode: number, stderr: string): string {
    const command = args.join(' ');
    
    if (stderr.includes('not a git repository')) {
      return 'Not in a git repository. Please run this command from within a git repository.';
    }
    
    if (stderr.includes('nothing to commit')) {
      return 'No changes to commit. All files are up to date.';
    }
    
    if (stderr.includes('working tree clean')) {
      return 'Working directory is clean - no changes to commit.';
    }
    
    return `Git command '${command}' failed with exit code ${exitCode}: ${stderr.trim() || 'Unknown error'}`;
  }

  private formatSpawnError(commandString: string, err: Error & { code?: string }): string {
    if (err.code === 'ENOENT') {
      return 'Git is not installed or not found in PATH. Please install git and try again.';
    }
    
    if (err.code === 'EACCES') {
      return 'Permission denied when trying to execute git command.';
    }
    
    return `Failed to execute '${commandString}': ${err.message} (code: ${err.code || 'unknown'})`;
  }
}