This is a minimal shell tool that executes a given command as `bash -c <command>`.
Command can be any valid single-line Bash command.
The following information is returned:

Command: Given command.
Stdout: Output on stdout stream. Can be `(empty)` or partial on error.
Stderr: Output on stderr stream. Can be `(empty)` or partial on error.
Error: Error or `(none)` if no error occurred.
Exit Code: Exit code or `(none)` if terminated by signal.
Signal: Signal number or `(none)` if no signal was received.
Background PIDs: List of background processes started or `(none)`.
