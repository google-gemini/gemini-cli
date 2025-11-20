// Copyright 2025 Google LLC
// SPDX-License-Identifier: Apache-2.0

#![allow(non_camel_case_types)]
#![allow(clippy::missing_safety_doc)]

use std::env;
use std::ffi::{CString, OsString};
use std::os::raw::{c_char, c_int, c_long, c_ulong};
use std::os::unix::ffi::{OsStrExt, OsStringExt};
use std::path::{Path, PathBuf};
use std::process::exit;

// ---------- FFI ----------
extern "C" {
    fn syscall(num: c_long, ...) -> c_long;
    fn open(pathname: *const c_char, flags: c_int) -> c_int;
    fn close(fd: c_int) -> c_int;
    fn execvp(file: *const c_char, argv: *const *const c_char) -> c_int;
    fn prctl(option: c_int, arg2: c_ulong, arg3: c_ulong, arg4: c_ulong, arg5: c_ulong) -> c_int;
}

// ---------- Consts ----------
const O_PATH: c_int = 0o10000000;
const O_CLOEXEC: c_int = 0o2000000;

const PR_SET_NO_NEW_PRIVS: c_int = 38;

const SYS_LANDLOCK_CREATE_RULESET: c_long = 444;
const SYS_LANDLOCK_ADD_RULE: c_long = 445;
const SYS_LANDLOCK_RESTRICT_SELF: c_long = 446;

const LANDLOCK_CREATE_RULESET_VERSION: c_uint = 1;
const LANDLOCK_RULE_PATH_BENEATH: c_uint = 1;

type c_uint = u32;

#[repr(C)]
struct landlock_ruleset_attr {
    handled_access_fs: u64,
    handled_access_net: u64,
    handled_access_mem: u64,
}

#[repr(C, packed)]
struct landlock_path_beneath_attr {
    allowed_access: u64,
    parent_fd: i32,
}

const ACCESS_FS_EXECUTE: u64 = 1 << 0;
const ACCESS_FS_WRITE_FILE: u64 = 1 << 1;
const ACCESS_FS_READ_FILE: u64 = 1 << 2;
const ACCESS_FS_READ_DIR: u64 = 1 << 3;
const ACCESS_FS_REMOVE_DIR: u64 = 1 << 4;
const ACCESS_FS_REMOVE_FILE: u64 = 1 << 5;
const ACCESS_FS_MAKE_CHAR: u64 = 1 << 6;
const ACCESS_FS_MAKE_DIR: u64 = 1 << 7;
const ACCESS_FS_MAKE_REG: u64 = 1 << 8;
const ACCESS_FS_MAKE_SOCK: u64 = 1 << 9;
const ACCESS_FS_MAKE_FIFO: u64 = 1 << 10;
const ACCESS_FS_MAKE_BLOCK: u64 = 1 << 11;
const ACCESS_FS_MAKE_SYM: u64 = 1 << 12;
const ACCESS_FS_REFER: u64 = 1 << 13;
const ACCESS_FS_TRUNCATE: u64 = 1 << 14;
const ACCESS_FS_IOCTL_DEV: u64 = 1 << 15;

fn main() {
    let mut args = env::args_os().collect::<Vec<_>>();
    if args.len() < 2 {
        usage_and_exit();
    }

    // Strip program name
    args.remove(0);

    let mut rw_paths: Vec<OsString> = Vec::new();
    let mut ro_paths: Vec<OsString> = Vec::new();

    while !args.is_empty() {
        if args[0] == "--" {
            args.remove(0);
            break;
        }
        if args.len() < 2 {
            usage_and_exit();
        }
        let flag = args.remove(0);
        let path = args.remove(0);
        match flag.as_os_str().to_str() {
          Some("--rw") => rw_paths.push(path),
          Some("--ro") => ro_paths.push(path),
          _ => usage_and_exit(),
        }
    }

    if args.is_empty() {
        eprintln!("[landlock-runner] Missing command to execute");
        exit(64);
    }

    // ABI check
    let abi = unsafe { syscall(SYS_LANDLOCK_CREATE_RULESET, 0 as c_int, 0 as c_int, LANDLOCK_CREATE_RULESET_VERSION) };
    if abi < 1 {
        eprintln!(
            "[landlock-runner] Landlock unavailable (errno {})",
            last_errno()
        );
        exit(112);
    }

    let handled = access_mask(true, abi as i32);
    let ruleset_attr = landlock_ruleset_attr {
        handled_access_fs: handled,
        handled_access_net: 0,
        handled_access_mem: 0,
    };

    let ruleset_fd = unsafe {
        syscall(
            SYS_LANDLOCK_CREATE_RULESET,
            &ruleset_attr as *const _,
            std::mem::size_of::<landlock_ruleset_attr>(),
            0 as c_int,
        )
    };
    if ruleset_fd < 0 {
        eprintln!(
            "[landlock-runner] landlock_create_ruleset failed (errno {})",
            last_errno()
        );
        exit(112);
    }

    // Allow read access to root for binaries/libs
    add_rule(ruleset_fd as c_int, "/", access_mask(false, abi as i32));

    for p in ro_paths {
        let (path, access) = normalize_path_and_access(&p, false, abi as i32);
        add_rule(ruleset_fd as c_int, path, access);
    }
    for p in rw_paths {
        let (path, access) = normalize_path_and_access(&p, true, abi as i32);
        add_rule(ruleset_fd as c_int, path, access);
    }

    if unsafe { prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) } != 0 {
        eprintln!(
            "[landlock-runner] prctl(PR_SET_NO_NEW_PRIVS) failed (errno {})",
            last_errno()
        );
        exit(112);
    }

    if unsafe { syscall(SYS_LANDLOCK_RESTRICT_SELF, ruleset_fd, 0 as c_int) } != 0 {
        eprintln!(
            "[landlock-runner] landlock_restrict_self failed (errno {})",
            last_errno()
        );
        exit(112);
    }

    unsafe { close(ruleset_fd as c_int) };

    // Build argv for execvp
    let cstrings: Vec<CString> = args
        .iter()
        .map(|a| {
            CString::new(a.clone().into_vec()).map_err(|e| {
                let display = a.to_string_lossy().into_owned();
                (e, display)
            })
        })
        .collect::<Result<Vec<_>, _>>()
        .unwrap_or_else(|(e, arg)| {
            eprintln!(
                "[landlock-runner] Invalid argument for execvp (contains null byte): {} ({})",
                arg,
                e
            );
            exit(126);
        });
    let mut argv: Vec<*const c_char> = cstrings.iter().map(|s| s.as_ptr()).collect();
    argv.push(std::ptr::null());

    let cmd = argv[0];
    unsafe {
        execvp(cmd, argv.as_ptr());
    }
    eprintln!(
        "[landlock-runner] exec failed (errno {}) while launching {:?}",
        last_errno(),
        args.get(0).and_then(|s| s.to_str())
    );
    exit(126);
}

fn normalize_path_and_access(
    path: &OsString,
    write: bool,
    abi: i32,
) -> (OsString, u64) {
    let mut access = access_mask(write, abi);

    // Landlock expects the path in a PATH_BENEATH rule to be a directory.
    // If a caller passed a file (e.g., /dev/null), fall back to its parent
    // directory and trim creation/removal permissions to avoid broadening
    // privileges unnecessarily.
    if let Ok(metadata) = std::fs::metadata(path) {
        if metadata.is_dir() {
            return (path.clone(), access);
        }

        // Narrow permissions when we have to allow a parent directory.
        const REMOVE_MASK: u64 = ACCESS_FS_REMOVE_DIR | ACCESS_FS_REMOVE_FILE;
        const MAKE_MASK: u64 = ACCESS_FS_MAKE_CHAR
            | ACCESS_FS_MAKE_DIR
            | ACCESS_FS_MAKE_REG
            | ACCESS_FS_MAKE_SOCK
            | ACCESS_FS_MAKE_FIFO
            | ACCESS_FS_MAKE_BLOCK
            | ACCESS_FS_MAKE_SYM;
        access &= !(REMOVE_MASK | MAKE_MASK);

        let parent: PathBuf = Path::new(path)
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("/"));
        return (parent.into_os_string(), access);
    }

    (path.clone(), access)
}

fn add_rule(fd: c_int, path: impl AsRef<std::ffi::OsStr>, access: u64) {
    let cpath = match CString::new(path.as_ref().as_bytes()) {
        Ok(p) => p,
        Err(_) => {
            eprintln!(
                "[landlock-runner] Skipping path with interior null: {:?}",
                path.as_ref()
            );
            return;
        }
    };

    let parent_fd = unsafe { open(cpath.as_ptr(), O_PATH | O_CLOEXEC) };
    if parent_fd < 0 {
        eprintln!(
          "[landlock-runner] Failed to open path {:?}: errno {}",
          path.as_ref(),
          last_errno()
        );
        exit(111);
    }

    let rule = landlock_path_beneath_attr {
        allowed_access: access,
        parent_fd,
    };

    let res = unsafe {
        syscall(
            SYS_LANDLOCK_ADD_RULE,
            fd,
            LANDLOCK_RULE_PATH_BENEATH,
            &rule as *const _,
            0 as c_int,
        )
    };

    unsafe { close(parent_fd) };

    if res != 0 {
        eprintln!(
            "[landlock-runner] landlock_add_rule failed for {:?}: errno {}",
            path.as_ref(),
            last_errno()
        );
        exit(111);
    }
}

fn access_mask(write: bool, abi: i32) -> u64 {
    let ro = ACCESS_FS_EXECUTE | ACCESS_FS_READ_FILE | ACCESS_FS_READ_DIR;
    let mut rw = ro
        | ACCESS_FS_WRITE_FILE
        | ACCESS_FS_REMOVE_DIR
        | ACCESS_FS_REMOVE_FILE
        | ACCESS_FS_MAKE_CHAR
        | ACCESS_FS_MAKE_DIR
        | ACCESS_FS_MAKE_REG
        | ACCESS_FS_MAKE_SOCK
        | ACCESS_FS_MAKE_FIFO
        | ACCESS_FS_MAKE_BLOCK
        | ACCESS_FS_MAKE_SYM;

    if abi >= 2 {
        rw |= ACCESS_FS_TRUNCATE | ACCESS_FS_REFER;
    }
    if abi >= 3 {
        rw |= ACCESS_FS_IOCTL_DEV;
    }

    if write {
        rw
    } else {
        ro
    }
}

fn last_errno() -> i32 {
    // SAFETY: libc errno is thread local; reading directly via libc binding is fine.
    extern "C" {
        #[cfg(any(target_os = "linux", target_os = "android"))]
        static __errno_location: *mut c_int;
    }
    unsafe { *__errno_location }
}

fn usage_and_exit() -> ! {
    eprintln!(
        "Usage: landlock-runner [--rw PATH]... [--ro PATH]... -- <command> [args...]"
    );
    exit(64);
}
