/**
 * Shared Task Runner Utility
 * Handles parallel process execution, log streaming, and dashboard rendering.
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface Task {
  id: string;
  name: string;
  cmd: string;
  dep?: string;
  condition?: 'success' | 'fail';
}

export class TaskRunner {
  private state: Record<string, { status: string; exitCode?: number }> = {};
  private tasks: Task[] = [];
  private logDir: string;
  private header: string;

  constructor(logDir: string, header: string) {
    this.logDir = logDir;
    this.header = header;
    fs.mkdirSync(logDir, { recursive: true });
  }

  register(tasks: Task[]) {
    this.tasks = tasks;
    tasks.forEach(t => this.state[t.id] = { status: 'PENDING' });
  }

  async run() {
    const runQueue = this.tasks.filter(t => !t.dep);
    runQueue.forEach(t => this.execute(t));

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const allDone = this.tasks.every(t => 
          ['SUCCESS', 'FAILED', 'SKIPPED'].includes(this.state[t.id].status)
        );

        if (allDone) {
          clearInterval(checkInterval);
          console.log('\n✨ All tasks complete.');
          resolve(this.state);
        }

        // Check for dependencies
        this.tasks.filter(t => t.dep && this.state[t.id].status === 'PENDING').forEach(t => {
          const parent = this.state[t.dep!];
          if (parent.status === 'SUCCESS' && (!t.condition || t.condition === 'success')) {
            this.execute(t);
          } else if (parent.status === 'FAILED' && t.condition === 'fail') {
            this.execute(t);
          } else if (['SUCCESS', 'FAILED'].includes(parent.status)) {
            this.state[t.id].status = 'SKIPPED';
          }
        });

        this.render();
      }, 1500);
    });
  }

  private execute(task: Task) {
    this.state[task.id].status = 'RUNNING';
    const proc = spawn(task.cmd, { shell: true, env: { ...process.env, FORCE_COLOR: '1' } });
    
    const logStream = fs.createWriteStream(path.join(this.logDir, `${task.id}.log`));
    proc.stdout.pipe(logStream);
    proc.stderr.pipe(logStream);

    proc.on('close', (code) => {
      const exitCode = code ?? 0;
      this.state[task.id].status = exitCode === 0 ? 'SUCCESS' : 'FAILED';
      this.state[task.id].exitCode = exitCode;
      fs.writeFileSync(path.join(this.logDir, `${task.id}.exit`), exitCode.toString());
    });
  }

  private render() {
    console.clear();
    console.log('==================================================');
    console.log(this.header);
    console.log('==================================================\n');
    
    this.tasks.forEach(t => {
      const s = this.state[t.id];
      const icon = s.status === 'SUCCESS' ? '✅' : s.status === 'FAILED' ? '❌' : s.status === 'RUNNING' ? '⏳' : s.status === 'SKIPPED' ? '⏭️ ' : '💤';
      console.log(`  ${icon} ${t.name.padEnd(20)}: ${s.status}`);
    });
  }
}
