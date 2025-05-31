This tool executes a given shell command as `bash -c <command>`.
Command can start background processes using `&`.
Command is executed as a subprocess that leads its own process group.
Command process group can be terminated as `kill -- -PGID` or signaled as `kill -s SIGNAL -- -PGID`.

The following information is returned:

Command: Executed command.
Directory: Directory (relative to project root) where command was executed, or `(root)`.
Stdout: Output on stdout stream. Can be `(empty)` or partial on error and for any unwaited background processes.
Stderr: Output on stderr stream. Can be `(empty)` or partial on error and for any unwaited background processes.
Error: Error or `(none)` if no error was reported for the subprocess.
Exit Code: Exit code or `(none)` if terminated by signal.
Signal: Signal number or `(none)` if no signal was received.
Background PIDs: List of background processes started or `(none)`.
Process Group PGID: Process group started or `(none)`
