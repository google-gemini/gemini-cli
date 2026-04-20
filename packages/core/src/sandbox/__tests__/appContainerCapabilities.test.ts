/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  AppContainerCapability,
  CapabilitySet,
  CAPABILITY_PRESETS,
  mapToSandboxCapabilities,
} from '../appContainerCapabilities.js';
import { IsolationLevel } from '../types.js';

describe('AppContainerCapability enum', () => {
  it('should define all expected capabilities', () => {
    expect(AppContainerCapability.InternetClient).toBe('internetClient');
    expect(AppContainerCapability.InternetClientServer).toBe(
      'internetClientServer',
    );
    expect(AppContainerCapability.PrivateNetworkClientServer).toBe(
      'privateNetworkClientServer',
    );
    expect(AppContainerCapability.DocumentsLibrary).toBe('documentsLibrary');
    expect(AppContainerCapability.PicturesLibrary).toBe('picturesLibrary');
    expect(AppContainerCapability.VideosLibrary).toBe('videosLibrary');
    expect(AppContainerCapability.MusicLibrary).toBe('musicLibrary');
    expect(AppContainerCapability.RemovableStorage).toBe('removableStorage');
    expect(AppContainerCapability.EnterpriseAuthentication).toBe(
      'enterpriseAuthentication',
    );
    expect(AppContainerCapability.SharedUserCertificates).toBe(
      'sharedUserCertificates',
    );
    expect(AppContainerCapability.Appointments).toBe('appointments');
    expect(AppContainerCapability.Contacts).toBe('contacts');
  });
});

describe('CapabilitySet', () => {
  it('should start empty by default', () => {
    const set = new CapabilitySet();
    expect(set.size).toBe(0);
    expect(set.toArray()).toEqual([]);
  });

  it('should accept initial capabilities', () => {
    const set = new CapabilitySet([
      AppContainerCapability.InternetClient,
      AppContainerCapability.DocumentsLibrary,
    ]);
    expect(set.size).toBe(2);
    expect(set.has(AppContainerCapability.InternetClient)).toBe(true);
    expect(set.has(AppContainerCapability.DocumentsLibrary)).toBe(true);
  });

  it('should add and remove capabilities', () => {
    const set = new CapabilitySet();
    set.add(AppContainerCapability.InternetClient);
    expect(set.has(AppContainerCapability.InternetClient)).toBe(true);
    expect(set.size).toBe(1);

    set.remove(AppContainerCapability.InternetClient);
    expect(set.has(AppContainerCapability.InternetClient)).toBe(false);
    expect(set.size).toBe(0);
  });

  it('should not duplicate capabilities', () => {
    const set = new CapabilitySet();
    set.add(AppContainerCapability.InternetClient);
    set.add(AppContainerCapability.InternetClient);
    expect(set.size).toBe(1);
  });

  it('should generate an empty PowerShell array when empty', () => {
    const set = new CapabilitySet();
    expect(set.toPowerShellArray()).toBe('@()');
  });

  it('should generate a PowerShell array with capability names', () => {
    const set = new CapabilitySet([
      AppContainerCapability.InternetClient,
      AppContainerCapability.DocumentsLibrary,
    ]);
    const ps = set.toPowerShellArray();
    expect(ps).toContain("'internetClient'");
    expect(ps).toContain("'documentsLibrary'");
    expect(ps).toMatch(/^@\(.+\)$/);
  });

  it('should detect network access capabilities', () => {
    const noNet = new CapabilitySet([AppContainerCapability.DocumentsLibrary]);
    expect(noNet.hasNetworkAccess()).toBe(false);

    const withNet = new CapabilitySet([AppContainerCapability.InternetClient]);
    expect(withNet.hasNetworkAccess()).toBe(true);

    const withServer = new CapabilitySet([
      AppContainerCapability.InternetClientServer,
    ]);
    expect(withServer.hasNetworkAccess()).toBe(true);

    const withPrivate = new CapabilitySet([
      AppContainerCapability.PrivateNetworkClientServer,
    ]);
    expect(withPrivate.hasNetworkAccess()).toBe(true);
  });

  it('should detect file library access capabilities', () => {
    const noFile = new CapabilitySet([AppContainerCapability.InternetClient]);
    expect(noFile.hasFileLibraryAccess()).toBe(false);

    const withDocs = new CapabilitySet([
      AppContainerCapability.DocumentsLibrary,
    ]);
    expect(withDocs.hasFileLibraryAccess()).toBe(true);

    const withPics = new CapabilitySet([
      AppContainerCapability.PicturesLibrary,
    ]);
    expect(withPics.hasFileLibraryAccess()).toBe(true);

    const withRemovable = new CapabilitySet([
      AppContainerCapability.RemovableStorage,
    ]);
    expect(withRemovable.hasFileLibraryAccess()).toBe(true);
  });
});

describe('CAPABILITY_PRESETS', () => {
  it('minimal preset should have no capabilities', () => {
    expect(CAPABILITY_PRESETS.minimal.size).toBe(0);
    expect(CAPABILITY_PRESETS.minimal.hasNetworkAccess()).toBe(false);
    expect(CAPABILITY_PRESETS.minimal.hasFileLibraryAccess()).toBe(false);
  });

  it('network preset should have only InternetClient', () => {
    expect(CAPABILITY_PRESETS.network.size).toBe(1);
    expect(
      CAPABILITY_PRESETS.network.has(AppContainerCapability.InternetClient),
    ).toBe(true);
    expect(CAPABILITY_PRESETS.network.hasNetworkAccess()).toBe(true);
  });

  it('full-io preset should have network and file access', () => {
    expect(CAPABILITY_PRESETS['full-io'].hasNetworkAccess()).toBe(true);
    expect(CAPABILITY_PRESETS['full-io'].hasFileLibraryAccess()).toBe(true);
    expect(
      CAPABILITY_PRESETS['full-io'].has(
        AppContainerCapability.DocumentsLibrary,
      ),
    ).toBe(true);
    expect(
      CAPABILITY_PRESETS['full-io'].has(
        AppContainerCapability.RemovableStorage,
      ),
    ).toBe(true);
  });
});

describe('mapToSandboxCapabilities', () => {
  it('should map an empty set to full isolation', () => {
    const caps = mapToSandboxCapabilities(new CapabilitySet());
    expect(caps.fileSystemIsolation).toBe(true);
    expect(caps.networkIsolation).toBe(true);
    expect(caps.processIsolation).toBe(true);
    expect(caps.mountSupport).toBe(false);
    expect(caps.envForwarding).toBe(true);
    expect(caps.portForwarding).toBe(false);
    expect(caps.platforms).toEqual(['win32']);
    expect(caps.isolationLevels).toContain(IsolationLevel.FileSystem);
    expect(caps.isolationLevels).toContain(IsolationLevel.Network);
    expect(caps.isolationLevels).toContain(IsolationLevel.Full);
  });

  it('should report no network isolation when network caps present', () => {
    const caps = mapToSandboxCapabilities(
      new CapabilitySet([AppContainerCapability.InternetClient]),
    );
    expect(caps.networkIsolation).toBe(false);
    expect(caps.isolationLevels).not.toContain(IsolationLevel.Network);
    expect(caps.isolationLevels).toContain(IsolationLevel.FileSystem);
    expect(caps.isolationLevels).toContain(IsolationLevel.Full);
  });
});
