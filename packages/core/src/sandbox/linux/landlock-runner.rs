// Copyright 2025 Google LLC
// SPDX-License-Identifier: Apache-2.0

#![allow(clippy::missing_safety_doc)]

use enumflags2::BitFlags;
use landlock::{
    Access, AccessFs, CompatLevel, Compatible, LandlockStatus, PathBeneath, PathFd, Ruleset,
    RulesetAttr, RulesetCreated, RulesetCreatedAttr, RulesetStatus, ABI,
};
use libc::{c_char, execvp};
use std::env;
use std::ffi::{CString, OsString};
use std::os::unix::ffi::OsStringExt;
use std::path::{Path, PathBuf};
use std::process::exit;

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

    // Request the latest ABI the crate knows about; compatibility will fall back when needed.
    let abi = ABI::V6;
    let ro_access = AccessFs::from_read(abi);
    let rw_access = AccessFs::from_all(abi);

    let handled = ro_access | rw_access;

    let mut ruleset = match Ruleset::default()
        .set_compatibility(CompatLevel::BestEffort)
        .handle_access(handled)
    {
        Ok(ruleset) => match ruleset.create() {
            Ok(created) => created,
            Err(err) => {
                eprintln!("[landlock-runner] landlock_create_ruleset failed ({err})");
                exit(112);
            }
        },
        Err(err) => {
            eprintln!("[landlock-runner] landlock_create_ruleset failed ({err})");
            exit(112);
        }
    };

    for p in ro_paths {
        let (path, access) = normalize_path_and_access(p, false, abi);
        ruleset = add_path_rule(ruleset, path, access);
    }
    for p in rw_paths {
        let (path, access) = normalize_path_and_access(p, true, abi);
        ruleset = add_path_rule(ruleset, path, access);
    }

    let status = match ruleset.restrict_self() {
        Ok(status) => status,
        Err(err) => {
            eprintln!("[landlock-runner] landlock_restrict_self failed ({err})");
            exit(112);
        }
    };

    if matches!(
        status.landlock,
        LandlockStatus::NotEnabled | LandlockStatus::NotImplemented
    ) || status.ruleset == RulesetStatus::NotEnforced
    {
        eprintln!(
            "[landlock-runner] Landlock unavailable (status: {:?})",
            status.landlock
        );
        exit(112);
    }

    if status.ruleset == RulesetStatus::PartiallyEnforced {
        eprintln!("[landlock-runner] Warning: Landlock rules partially enforced");
    }

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
                "[landlock-runner] Invalid argument for execvp (contains null byte): {arg} ({e})"
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

fn add_path_rule(
    ruleset: RulesetCreated,
    path: OsString,
    access: BitFlags<AccessFs>,
) -> RulesetCreated {
    let fd = match PathFd::new(&path) {
        Ok(fd) => fd,
        Err(err) => {
            eprintln!("[landlock-runner] Failed to open path {:?}: {err}", path);
            exit(111);
        }
    };
    let rule = PathBeneath::new(fd, access);
    match ruleset.add_rule(rule) {
        Ok(ruleset) => ruleset,
        Err(err) => {
            eprintln!(
                "[landlock-runner] landlock_add_rule failed for {:?}: {err}",
                path
            );
            exit(111);
        }
    }
}

fn normalize_path_and_access(
    path: OsString,
    write: bool,
    abi: ABI,
) -> (OsString, BitFlags<AccessFs>) {
    let mut access = if write {
        AccessFs::from_all(abi)
    } else {
        AccessFs::from_read(abi)
    };

    // Landlock expects the path in a PATH_BENEATH rule to be a directory.
    // If a caller passed a file (e.g., /dev/null), fall back to its parent
    // directory and trim creation/removal permissions to avoid broadening
    // privileges unnecessarily.
    if let Ok(metadata) = std::fs::metadata(&path) {
        if metadata.is_dir() {
            return (path, access);
        }

        access.remove(
            AccessFs::RemoveDir
                | AccessFs::RemoveFile
                | AccessFs::MakeChar
                | AccessFs::MakeDir
                | AccessFs::MakeReg
                | AccessFs::MakeSock
                | AccessFs::MakeFifo
                | AccessFs::MakeBlock
                | AccessFs::MakeSym,
        );

        let parent: PathBuf = Path::new(&path)
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("/"));
        return (parent.into_os_string(), access);
    }

    (path, access)
}

fn last_errno() -> i32 {
    unsafe { *libc::__errno_location() }
}

fn usage_and_exit() -> ! {
    eprintln!(
        "Usage: landlock-runner [--rw PATH]... [--ro PATH]... -- <command> [args...]"
    );
    exit(64);
}
