/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SafetyLevel } from './safety-analyzer.js';
// command safety database

export type ExtendedSafetyLevel = SafetyLevel | 'analyze-nested-command';

// Recursive type to handle nested command structures
// Use an interface to handle recursive structure
export interface CommandSafetyValue {
  [key: string]: ExtendedSafetyLevel | CommandSafetyValue;
}

export const commandSafety: Record<
  string,
  ExtendedSafetyLevel | CommandSafetyValue
> = {
  // File System Viewing - SAFE
  ls: 'safe',
  ll: 'safe',
  la: 'safe',
  dir: 'safe',
  cat: 'safe',
  less: 'safe',
  more: 'safe',
  head: 'safe',
  tail: 'safe',
  pwd: 'safe',
  whoami: 'safe',
  id: 'safe',
  file: 'safe',
  stat: 'safe',
  tree: 'safe',
  locate: 'safe',
  which: 'safe',
  whereis: 'safe',

  // Find command - context dependent
  find: {
    // Safe read-only operations
    '-name': 'safe',
    '-type': 'safe',
    '-size': 'safe',
    '-mtime': 'safe',
    '-user': 'safe',
    '-group': 'safe',
    '-perm': 'safe',
    '-ls': 'safe',
    '-print': 'safe',
    '-printf': 'safe',
    // Dangerous operations
    '-delete': 'dangerous',
    '-exec': 'requires-approval',
    '-execdir': 'requires-approval',
    // Default for unknown find operations
    '*': 'requires-approval',
  },

  // Disk usage - SAFE
  du: 'safe',
  df: 'safe',

  // Text Processing - mostly SAFE
  grep: 'safe',
  egrep: 'safe',
  fgrep: 'safe',
  sort: 'safe',
  uniq: 'safe',
  wc: 'safe',
  cut: 'safe',
  awk: 'safe',
  diff: 'safe',
  cmp: 'safe',
  strings: 'safe',

  // Sed - context dependent
  sed: {
    // In-place editing is risky
    '-i': 'requires-approval',
    '--in-place': 'requires-approval',
    // Default sed (stdout only) is safe
    '*': 'safe',
  },

  // Git commands
  git: {
    // Safe read-only operations
    status: 'safe',
    log: 'safe',
    show: 'safe',
    diff: 'safe',
    'ls-files': 'safe',
    remote: 'safe',
    config: {
      '--list': 'safe',
      '--get': 'safe',
      '--global': 'requires-approval',
      '--system': 'dangerous',
      '*': 'requires-approval',
    },
    branch: {
      // Listing branches is safe
      '-l': 'safe',
      '--list': 'safe',
      '-a': 'safe',
      '-r': 'safe',
      // Creating/deleting branches requires approval
      '-d': 'requires-approval',
      '-D': 'dangerous',
      '-m': 'requires-approval',
      '*': 'requires-approval',
    },

    // Operations that modify state
    add: 'requires-approval',
    commit: 'requires-approval',
    checkout: 'requires-approval',
    switch: 'requires-approval',
    merge: 'requires-approval',
    pull: 'requires-approval',
    fetch: 'safe',
    push: 'requires-approval',
    tag: 'requires-approval',
    stash: 'requires-approval',

    // Dangerous operations
    reset: {
      '--soft': 'requires-approval',
      '--mixed': 'requires-approval',
      '--hard': 'dangerous',
      '*': 'requires-approval',
    },
    clean: {
      '-n': 'safe', // dry run
      '--dry-run': 'safe',
      '-f': 'dangerous',
      '-fd': 'dangerous',
      '-fx': 'dangerous',
      '*': 'requires-approval',
    },
    rm: 'requires-approval',
    mv: 'requires-approval',
    rebase: 'requires-approval',
    'cherry-pick': 'requires-approval',
  },

  // System Information - SAFE
  ps: 'safe',
  top: 'safe',
  htop: 'safe',
  uptime: 'safe',
  date: 'safe',
  uname: 'safe',
  lsb_release: 'safe',
  env: 'safe',
  printenv: 'safe',
  history: 'safe',
  jobs: 'safe',

  // Network - mostly SAFE for read operations
  ping: 'safe',
  nslookup: 'safe',
  dig: 'safe',
  netstat: 'safe',
  ss: 'safe',

  // Curl - context dependent
  curl: {
    '-X': {
      GET: 'safe',
      POST: 'requires-approval',
      PUT: 'requires-approval',
      DELETE: 'requires-approval',
      PATCH: 'requires-approval',
      '*': 'requires-approval', // Default for unknown HTTP methods
    },
    '--request': {
      GET: 'safe',
      POST: 'requires-approval',
      PUT: 'requires-approval',
      DELETE: 'requires-approval',
      PATCH: 'requires-approval',
      '*': 'requires-approval',
    },
    '-I': 'safe', // HEAD request
    '--head': 'safe', // HEAD request
    '-d': 'requires-approval', // Data (implies POST)
    '--data': 'requires-approval', // Data (implies POST)
    '-F': 'requires-approval', // Form data
    '--form': 'requires-approval', // Form data
    '-u': 'requires-approval', // Authentication
    '--user': 'requires-approval', // Authentication
    '-H': 'safe', // Headers (generally safe)
    '--header': 'safe', // Headers (generally safe)
    '-o': 'requires-approval', // Output to file can overwrite data
    '--output': 'requires-approval', // Output to file can overwrite data
    '-L': 'safe', // Follow redirects
    '--location': 'safe', // Follow redirects
    '*': 'safe', // Default GET behavior is safe
  },

  // Wget - context dependent
  wget: {
    '--spider': 'safe',
    '--dry-run': 'safe',
    '-O': 'requires-approval',
    '--output-document': 'requires-approval',
    '*': 'requires-approval',
  },

  // File Operations - REQUIRES APPROVAL
  cp: 'requires-approval',
  mv: 'requires-approval',
  mkdir: 'requires-approval',
  rmdir: 'requires-approval',
  touch: 'requires-approval',
  ln: 'requires-approval',

  // Permissions - context dependent
  chmod: {
    // Recursive operations are more dangerous
    '-R': 'dangerous',
    '--recursive': 'dangerous',
    '*': 'requires-approval',
  },
  chown: {
    '-R': 'dangerous',
    '--recursive': 'dangerous',
    '*': 'requires-approval',
  },

  // Package Management
  npm: {
    list: 'safe',
    ls: 'safe',
    view: 'safe',
    info: 'safe',
    search: 'safe',
    install: 'requires-approval',
    uninstall: 'requires-approval',
    update: 'requires-approval',
    run: 'requires-approval',
    start: 'requires-approval',
    test: 'requires-approval',
    build: 'requires-approval',
    '*': 'requires-approval',
  },

  pip: {
    list: 'safe',
    show: 'safe',
    search: 'safe',
    install: 'requires-approval',
    uninstall: 'requires-approval',
    upgrade: 'requires-approval',
    '*': 'requires-approval',
  },

  apt: {
    list: 'safe',
    search: 'safe',
    show: 'safe',
    policy: 'safe',
    install: 'requires-approval',
    remove: 'dangerous',
    purge: 'dangerous',
    update: 'requires-approval',
    upgrade: 'requires-approval',
    autoremove: 'dangerous',
    '*': 'requires-approval',
  },

  brew: {
    list: 'safe',
    search: 'safe',
    info: 'safe',
    deps: 'safe',
    install: 'requires-approval',
    uninstall: 'requires-approval',
    update: 'requires-approval',
    upgrade: 'requires-approval',
    '*': 'requires-approval',
  },

  // Development Tools
  make: 'requires-approval',
  cmake: 'requires-approval',
  gcc: 'requires-approval',
  'g++': 'requires-approval',
  javac: 'requires-approval',
  python: 'requires-approval',
  python3: 'requires-approval',
  node: 'requires-approval',

  // Docker
  docker: {
    ps: 'safe',
    images: 'safe',
    version: 'safe',
    info: 'safe',
    logs: 'safe',
    inspect: 'safe',
    build: 'requires-approval',
    run: 'requires-approval',
    exec: 'requires-approval',
    start: 'requires-approval',
    stop: 'requires-approval',
    restart: 'requires-approval',
    kill: 'dangerous',
    rm: 'requires-approval',
    rmi: 'requires-approval',
    pull: 'requires-approval',
    push: 'requires-approval',
    '*': 'requires-approval',
  },

  // DANGEROUS COMMANDS
  rm: {
    '-rf': 'dangerous',
    '-r': 'dangerous',
    '-f': 'dangerous',
    '--recursive': 'dangerous',
    '--force': 'dangerous',
    '*': 'requires-approval',
  },
  shred: 'dangerous',
  dd: 'dangerous',

  // System Control - DANGEROUS
  sudo: 'dangerous',
  su: 'dangerous',
  shutdown: 'dangerous',
  reboot: 'dangerous',
  halt: 'dangerous',
  poweroff: 'dangerous',

  // Process Management
  kill: 'requires-approval',
  killall: 'dangerous',
  pkill: 'dangerous',

  // Network Security
  iptables: 'dangerous',
  ufw: 'dangerous',
  'firewall-cmd': 'dangerous',

  // SSH/Security
  'ssh-keygen': 'requires-approval',
  openssl: 'requires-approval',
  gpg: 'requires-approval',

  // Context-dependent commands
  timeout: {
    '*': 'analyze-nested-command',
  },

  xargs: {
    '*': 'analyze-nested-command',
  },

  watch: {
    '*': 'analyze-nested-command',
  },

  // Text editors - generally safe but can modify files
  nano: 'requires-approval',
  vim: 'requires-approval',
  vi: 'requires-approval',
  emacs: 'requires-approval',
  code: 'requires-approval',

  // Archive operations
  tar: {
    '-t': 'safe', // list contents
    '--list': 'safe',
    '-x': 'requires-approval', // extract
    '--extract': 'requires-approval',
    '-c': 'requires-approval', // create
    '--create': 'requires-approval',
    '*': 'requires-approval',
  },
  zip: 'requires-approval',
  unzip: {
    '-l': 'safe', // list contents
    '*': 'requires-approval',
  },
  gzip: 'requires-approval',
  gunzip: 'requires-approval',
};
