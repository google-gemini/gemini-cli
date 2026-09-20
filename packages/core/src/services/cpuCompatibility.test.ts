/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as child_process from 'node:child_process';

import {
  detectCpuFeatures,
  checkCpuCompatibility,
  getMicroarchLevel,
  getIncompatibilityWarning,
  REQUIRED_FEATURES,
  type CpuFeatureFlags,
  type CpuCompatibilityResult,
} from './cpuCompatibility.js';

vi.mock('node:fs');
vi.mock('node:child_process');

const mockCpus = vi.fn();
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    cpus: (...args: unknown[]) => mockCpus(...args),
  };
});

describe('cpuCompatibility', () => {
  const originalPlatform = process.platform;
  const originalArch = process.arch;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    Object.defineProperty(process, 'arch', { value: originalArch });
    vi.restoreAllMocks();
  });

  describe('detectCpuFeatures', () => {
    describe('on Linux', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
      });

      it('should parse /proc/cpuinfo for a modern CPU with full AVX2 support', () => {
        const cpuinfoContent = [
          'processor\t: 0',
          'vendor_id\t: GenuineIntel',
          'model name\t: Intel(R) Core(TM) i7-8700K CPU @ 3.70GHz',
          'flags\t\t: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology tsc_reliable nonstop_tsc aperfmperf tsc_known_freq pni pclmulqdq dtes64 monitor ds_cpl est tm2 ssse3 sdbg fma cx16 xtpr pdcm sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch epb invpcid_single ssbd ibrs ibpb stibp tpr_shadow vnmi flexpriority ept vpid fsgsbase tsc_adjust bmi1 avx2 smep bmi2 erms invpcid mpx rdseed adx smap clflushopt intel_pt xsaveopt xsavec xgetbv1 dtherm ida arat pln pts hwp hwp_notify hwp_act_window hwp_epp',
          '',
        ].join('\n');

        vi.mocked(fs.readFileSync).mockReturnValue(cpuinfoContent);

        const flags = detectCpuFeatures();

        expect(flags.sse42).toBe(true);
        expect(flags.avx).toBe(true);
        expect(flags.avx2).toBe(true);
        expect(flags.aesni).toBe(true);
      });

      it('should detect missing AVX on legacy AMD A6-3420M (issue #27342 CPU)', () => {
        const cpuinfoContent = [
          'processor\t: 0',
          'vendor_id\t: AuthenticAMD',
          'model name\t: AMD A6-3420M APU with Radeon(tm) HD Graphics',
          'flags\t\t: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush mmx fxsr sse sse2 ht syscall nx mmxext fxsr_opt pdpe1gb rdtscp lm constant_tsc rep_good nopl nonstop_tsc extd_apicid aperfmperf pni pclmulqdq monitor ssse3 cx16 sse4_1 sse4_2 popcnt lahf_lm cmp_legacy svm extapic cr8_legacy abm sse4a misalignsse 3dnowprefetch osvw ibs skinit wdt cpb hw_pstate npt lbrv svm_lock nrip_save tsc_scale vmcb_clean flushbyasid decodeassists pausefilter pfthreshold',
          '',
        ].join('\n');

        vi.mocked(fs.readFileSync).mockReturnValue(cpuinfoContent);

        const flags = detectCpuFeatures();

        expect(flags.sse42).toBe(true);
        expect(flags.avx).toBe(false);
        expect(flags.avx2).toBe(false);
        expect(flags.aesni).toBe(false);
      });

      it('should detect missing SSE4.2 on Intel Core 2 Duo', () => {
        const cpuinfoContent = [
          'processor\t: 0',
          'model name\t: Intel(R) Core(TM)2 Duo CPU E8400 @ 3.00GHz',
          'flags\t\t: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx lm constant_tsc arch_perfmon pebs bts rep_good nopl aperfmperf pni dtes64 monitor ds_cpl est tm2 ssse3 cx16 xtpr pdcm sse4_1 lahf_lm dtherm tpr_shadow',
          '',
        ].join('\n');

        vi.mocked(fs.readFileSync).mockReturnValue(cpuinfoContent);

        const flags = detectCpuFeatures();

        expect(flags.sse42).toBe(false);
        expect(flags.avx).toBe(false);
        expect(flags.avx2).toBe(false);
      });

      it('should handle empty /proc/cpuinfo gracefully', () => {
        vi.mocked(fs.readFileSync).mockReturnValue('');

        const flags = detectCpuFeatures();

        expect(flags.sse42).toBe(false);
        expect(flags.avx).toBe(false);
        expect(flags.avx2).toBe(false);
        expect(flags.aesni).toBe(false);
      });

      it('should handle /proc/cpuinfo read failure gracefully', () => {
        vi.mocked(fs.readFileSync).mockImplementation(() => {
          throw new Error('ENOENT: no such file or directory');
        });

        const flags = detectCpuFeatures();

        expect(flags.sse42).toBe(false);
        expect(flags.avx).toBe(false);
      });

      it('should not false-positive avx when only avx512 is present in flags string', () => {
        const cpuinfoContent = [
          'processor\t: 0',
          'model name\t: Some CPU',
          'flags\t\t: fpu sse sse2 sse4_2 avx512f avx512bw',
          '',
        ].join('\n');

        vi.mocked(fs.readFileSync).mockReturnValue(cpuinfoContent);

        const flags = detectCpuFeatures();

        // avx512f contains "avx" but should not match word boundary for \bavx\b
        expect(flags.avx).toBe(false);
        expect(flags.sse42).toBe(true);
      });
    });

    describe('on macOS', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'darwin' });
      });

      it('should query sysctl for CPU features on modern Mac', () => {
        vi.mocked(child_process.execFileSync).mockImplementation(
          (_cmd: string, args?: readonly string[]) => {
            const key = args?.[1];
            if (key === 'hw.optional.sse4_2') return '1';
            if (key === 'hw.optional.avx1_0') return '1';
            if (key === 'hw.optional.avx2_0') return '1';
            if (key === 'hw.optional.aes') return '1';
            return '0';
          },
        );

        const flags = detectCpuFeatures();

        expect(flags.sse42).toBe(true);
        expect(flags.avx).toBe(true);
        expect(flags.avx2).toBe(true);
        expect(flags.aesni).toBe(true);
      });

      it('should handle sysctl failure gracefully', () => {
        vi.mocked(child_process.execFileSync).mockImplementation(() => {
          throw new Error('sysctl command not found');
        });

        const flags = detectCpuFeatures();

        expect(flags.sse42).toBe(false);
        expect(flags.avx).toBe(false);
      });
    });

    describe('on Windows', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
      });

      it('should detect legacy AMD A-Series as incompatible via model string heuristic', () => {
        mockCpus.mockReturnValue([
          {
            model: 'AMD A4-3300M APU with Radeon HD Graphics',
            speed: 1900,
            times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
          },
        ]);

        const flags = detectCpuFeatures();

        expect(flags.avx).toBe(false);
        expect(flags.avx2).toBe(false);
      });

      it('should detect Intel Core 2 Duo as incompatible via model string heuristic', () => {
        mockCpus.mockReturnValue([
          {
            model: 'Intel(R) Core(TM)2 Duo CPU E8400 @ 3.00GHz',
            speed: 3000,
            times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
          },
        ]);

        const flags = detectCpuFeatures();

        expect(flags.avx).toBe(false);
        expect(flags.avx2).toBe(false);
      });

      it('should detect modern Intel Core i7 as compatible', () => {
        mockCpus.mockReturnValue([
          {
            model: 'Intel(R) Core(TM) i7-12700K CPU @ 3.60GHz',
            speed: 3600,
            times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
          },
        ]);

        const flags = detectCpuFeatures();

        expect(flags.avx).toBe(true);
        expect(flags.avx2).toBe(true);
      });

      it('should handle empty os.cpus() array gracefully', () => {
        mockCpus.mockReturnValue([]);

        const flags = detectCpuFeatures();

        expect(flags.sse42).toBe(false);
        expect(flags.avx).toBe(false);
      });
    });

    describe('on unsupported platforms', () => {
      it('should return default flags for freebsd', () => {
        Object.defineProperty(process, 'platform', { value: 'freebsd' });

        const flags = detectCpuFeatures();

        expect(flags.sse42).toBe(false);
        expect(flags.avx).toBe(false);
      });
    });
  });

  describe('getMicroarchLevel', () => {
    it('should return x86-64-v3 for CPU with AVX and AVX2', () => {
      const flags: CpuFeatureFlags = {
        sse42: true,
        avx: true,
        avx2: true,
        aesni: true,
      };
      Object.defineProperty(process, 'arch', { value: 'x64' });

      expect(getMicroarchLevel(flags)).toBe('x86-64-v3');
    });

    it('should return x86-64-v2 for CPU with SSE4.2 but no AVX', () => {
      const flags: CpuFeatureFlags = {
        sse42: true,
        avx: false,
        avx2: false,
        aesni: true,
      };
      Object.defineProperty(process, 'arch', { value: 'x64' });

      expect(getMicroarchLevel(flags)).toBe('x86-64-v2');
    });

    it('should return x86-64-v1 for CPU without SSE4.2 or AVX', () => {
      const flags: CpuFeatureFlags = {
        sse42: false,
        avx: false,
        avx2: false,
        aesni: false,
      };
      Object.defineProperty(process, 'arch', { value: 'x64' });

      expect(getMicroarchLevel(flags)).toBe('x86-64-v1');
    });

    it('should return non-x86 for ARM architecture', () => {
      const flags: CpuFeatureFlags = {
        sse42: false,
        avx: false,
        avx2: false,
        aesni: false,
      };
      Object.defineProperty(process, 'arch', { value: 'arm64' });

      expect(getMicroarchLevel(flags)).toBe('non-x86');
    });
  });

  describe('checkCpuCompatibility', () => {
    it('should report compatible for modern x86 CPU with AVX2', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      Object.defineProperty(process, 'arch', { value: 'x64' });
      mockCpus.mockReturnValue([
        {
          model: 'Intel(R) Core(TM) i7-8700K CPU @ 3.70GHz',
          speed: 3700,
          times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
        },
      ]);

      vi.mocked(fs.readFileSync).mockReturnValue(
        'flags\t\t: sse4_2 avx avx2 aes\n',
      );

      const result = checkCpuCompatibility();

      expect(result.compatible).toBe(true);
      expect(result.missingFeatures).toHaveLength(0);
      expect(result.microarchLevel).toBe('x86-64-v3');
    });

    it('should report incompatible for AMD A6-3420M (issue #27342)', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      Object.defineProperty(process, 'arch', { value: 'x64' });
      mockCpus.mockReturnValue([
        {
          model: 'AMD A6-3420M APU with Radeon(tm) HD Graphics',
          speed: 1500,
          times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
        },
      ]);

      vi.mocked(fs.readFileSync).mockReturnValue(
        'flags\t\t: fpu sse sse2 sse4_1 sse4_2 pclmulqdq ssse3\n',
      );

      const result = checkCpuCompatibility();

      expect(result.compatible).toBe(false);
      expect(result.missingFeatures).toContain('AVX');
      expect(result.missingFeatures).toContain('AVX2');
      expect(result.microarchLevel).toBe('x86-64-v2');
      expect(result.cpuModel).toContain('AMD A6-3420M');
    });

    it('should report compatible for ARM64 regardless of feature flags', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      Object.defineProperty(process, 'arch', { value: 'arm64' });
      mockCpus.mockReturnValue([
        {
          model: 'Apple M2',
          speed: 3500,
          times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
        },
      ]);

      const result = checkCpuCompatibility();

      expect(result.compatible).toBe(true);
      expect(result.arch).toBe('arm64');
    });

    it('should include all required features in REQUIRED_FEATURES', () => {
      expect(REQUIRED_FEATURES).toContain('sse42');
      expect(REQUIRED_FEATURES).toContain('avx');
      expect(REQUIRED_FEATURES).toContain('avx2');
    });
  });

  describe('getIncompatibilityWarning', () => {
    it('should return empty string for compatible CPUs', () => {
      const result: CpuCompatibilityResult = {
        compatible: true,
        cpuModel: 'Intel i9',
        arch: 'x64',
        microarchLevel: 'x86-64-v3',
        features: { sse42: true, avx: true, avx2: true, aesni: true },
        missingFeatures: [],
      };

      expect(getIncompatibilityWarning(result)).toBe('');
    });

    it('should return detailed warning for incompatible CPUs', () => {
      const result: CpuCompatibilityResult = {
        compatible: false,
        cpuModel: 'AMD A6-3420M APU',
        arch: 'x64',
        microarchLevel: 'x86-64-v2',
        features: { sse42: true, avx: false, avx2: false, aesni: false },
        missingFeatures: ['AVX', 'AVX2'],
      };

      const warning = getIncompatibilityWarning(result);

      expect(warning).toContain('Hardware Compatibility Warning');
      expect(warning).toContain('AMD A6-3420M');
      expect(warning).toContain('AVX, AVX2');
      expect(warning).toContain('x86-64-v2');
      expect(warning).toContain('Illegal instruction');
      expect(warning).toContain('issues/27342');
    });

    it('should mention exit code 132 (SIGILL) in the warning', () => {
      const result: CpuCompatibilityResult = {
        compatible: false,
        cpuModel: 'Intel Core 2 Duo',
        arch: 'x64',
        microarchLevel: 'x86-64-v1',
        features: { sse42: false, avx: false, avx2: false, aesni: false },
        missingFeatures: ['SSE42', 'AVX', 'AVX2'],
      };

      const warning = getIncompatibilityWarning(result);

      expect(warning).toContain('exit code 132');
      expect(warning).toContain('x86-64-v1');
    });
  });
});
