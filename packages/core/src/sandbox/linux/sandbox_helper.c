/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/prctl.h>
#include <linux/seccomp.h>
#include <linux/filter.h>
#include <linux/audit.h>
#include <stddef.h>
#include <sys/syscall.h>

#define SECCOMP_BPF_STMT(code, jt, jf, k) { (unsigned short)(code), (unsigned char)(jt), (unsigned char)(jf), (unsigned int)(k) }

#if defined(__x86_64__)
#define SECCOMP_AUDIT_ARCH AUDIT_ARCH_X86_64
#elif defined(__i386__)
#define SECCOMP_AUDIT_ARCH AUDIT_ARCH_I386
#elif defined(__aarch64__)
#define SECCOMP_AUDIT_ARCH AUDIT_ARCH_AARCH64
#elif defined(__arm__)
#define SECCOMP_AUDIT_ARCH AUDIT_ARCH_ARM
#else
#error "Unsupported architecture for seccomp filter"
#endif

static void install_seccomp() {
    struct sock_filter filter[] = {
        // Load architecture from seccomp data
        SECCOMP_BPF_STMT(BPF_LD | BPF_W | BPF_ABS, 0, 0, offsetof(struct seccomp_data, arch)),
        // If not matching native arch, KILL
        SECCOMP_BPF_STMT(BPF_JMP | BPF_JEQ | BPF_K, 1, 0, SECCOMP_AUDIT_ARCH),
        SECCOMP_BPF_STMT(BPF_RET | BPF_K, 0, 0, SECCOMP_RET_KILL_PROCESS),

        // Load syscall number
        SECCOMP_BPF_STMT(BPF_LD | BPF_W | BPF_ABS, 0, 0, offsetof(struct seccomp_data, nr)),
        // If it's ptrace, jump to ERRNO
        SECCOMP_BPF_STMT(BPF_JMP | BPF_JEQ | BPF_K, 0, 1, SYS_ptrace),
        SECCOMP_BPF_STMT(BPF_RET | BPF_K, 0, 0, SECCOMP_RET_ERRNO | 1), // EPERM = 1

        // Default allow
        SECCOMP_BPF_STMT(BPF_RET | BPF_K, 0, 0, SECCOMP_RET_ALLOW)
    };

    struct sock_fprog prog = {
        .len = (unsigned short)(sizeof(filter) / sizeof(filter[0])),
        .filter = filter,
    };

    // prctl PR_SET_NO_NEW_PRIVS is required before setting seccomp filter
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) {
        perror("prctl(PR_SET_NO_NEW_PRIVS)");
        exit(1);
    }

    if (prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &prog) != 0) {
        perror("prctl(PR_SET_SECCOMP)");
        exit(1);
    }
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <command> [args...]\n", argv[0]);
        exit(1);
    }

    install_seccomp();

    execvp(argv[1], &argv[1]);
    perror("execvp");
    return 1;
}
