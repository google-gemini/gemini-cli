/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Windows AppContainer capability definitions.
 *
 * These map to the well-known SIDs used by the Windows AppContainer
 * isolation model. Each capability grants access to a specific resource
 * class (network, file library, device, etc.).
 *
 * @see https://learn.microsoft.com/en-us/windows/win32/secauthz/well-known-sids
 */

import type { SandboxCapabilities } from './types.js';
import { IsolationLevel } from './types.js';

/**
 * Well-known Windows AppContainer capabilities.
 */
export enum AppContainerCapability {
  /** Outbound network access to the Internet. */
  InternetClient = 'internetClient',
  /** Inbound and outbound network access to the Internet. */
  InternetClientServer = 'internetClientServer',
  /** Inbound and outbound access on private (home/work) networks. */
  PrivateNetworkClientServer = 'privateNetworkClientServer',
  /** Access to the user's Pictures library. */
  PicturesLibrary = 'picturesLibrary',
  /** Access to the user's Videos library. */
  VideosLibrary = 'videosLibrary',
  /** Access to the user's Music library. */
  MusicLibrary = 'musicLibrary',
  /** Access to the user's Documents library. */
  DocumentsLibrary = 'documentsLibrary',
  /** Windows domain credentials for authentication. */
  EnterpriseAuthentication = 'enterpriseAuthentication',
  /** Access to shared user certificates. */
  SharedUserCertificates = 'sharedUserCertificates',
  /** Access to removable storage devices. */
  RemovableStorage = 'removableStorage',
  /** Access to the user's Appointments store. */
  Appointments = 'appointments',
  /** Access to the user's Contacts store. */
  Contacts = 'contacts',
}

/**
 * Maps AppContainerCapability values to their PowerShell
 * `New-AppContainerProfile -Capability` parameter names.
 */
const CAPABILITY_PS_NAMES: Record<AppContainerCapability, string> = {
  [AppContainerCapability.InternetClient]: 'internetClient',
  [AppContainerCapability.InternetClientServer]: 'internetClientServer',
  [AppContainerCapability.PrivateNetworkClientServer]:
    'privateNetworkClientServer',
  [AppContainerCapability.PicturesLibrary]: 'picturesLibrary',
  [AppContainerCapability.VideosLibrary]: 'videosLibrary',
  [AppContainerCapability.MusicLibrary]: 'musicLibrary',
  [AppContainerCapability.DocumentsLibrary]: 'documentsLibrary',
  [AppContainerCapability.EnterpriseAuthentication]: 'enterpriseAuthentication',
  [AppContainerCapability.SharedUserCertificates]: 'sharedUserCertificates',
  [AppContainerCapability.RemovableStorage]: 'removableStorage',
  [AppContainerCapability.Appointments]: 'appointments',
  [AppContainerCapability.Contacts]: 'contacts',
};

/**
 * Manages a set of AppContainer capabilities and provides utilities
 * for converting them to PowerShell arguments and SandboxCapabilities.
 */
export class CapabilitySet {
  private readonly capabilities: Set<AppContainerCapability>;

  constructor(capabilities: AppContainerCapability[] = []) {
    this.capabilities = new Set(capabilities);
  }

  /** Adds a capability to the set. */
  add(capability: AppContainerCapability): void {
    this.capabilities.add(capability);
  }

  /** Removes a capability from the set. */
  remove(capability: AppContainerCapability): void {
    this.capabilities.delete(capability);
  }

  /** Returns true if the set contains the given capability. */
  has(capability: AppContainerCapability): boolean {
    return this.capabilities.has(capability);
  }

  /** Returns the number of capabilities in the set. */
  get size(): number {
    return this.capabilities.size;
  }

  /** Returns all capabilities as an array. */
  toArray(): AppContainerCapability[] {
    return [...this.capabilities];
  }

  /**
   * Returns the capabilities as a PowerShell-compatible capability
   * string array literal, e.g. `@('internetClient','documentsLibrary')`.
   */
  toPowerShellArray(): string {
    if (this.capabilities.size === 0) {
      return '@()';
    }
    const names = [...this.capabilities].map(
      (c) => `'${CAPABILITY_PS_NAMES[c]}'`,
    );
    return `@(${names.join(',')})`;
  }

  /** Returns true if any networking capability is present. */
  hasNetworkAccess(): boolean {
    return (
      this.capabilities.has(AppContainerCapability.InternetClient) ||
      this.capabilities.has(AppContainerCapability.InternetClientServer) ||
      this.capabilities.has(AppContainerCapability.PrivateNetworkClientServer)
    );
  }

  /** Returns true if any file library capability is present. */
  hasFileLibraryAccess(): boolean {
    return (
      this.capabilities.has(AppContainerCapability.PicturesLibrary) ||
      this.capabilities.has(AppContainerCapability.VideosLibrary) ||
      this.capabilities.has(AppContainerCapability.MusicLibrary) ||
      this.capabilities.has(AppContainerCapability.DocumentsLibrary) ||
      this.capabilities.has(AppContainerCapability.RemovableStorage)
    );
  }
}

/**
 * Preset capability profiles for common use cases.
 */
export const CAPABILITY_PRESETS = {
  /** No capabilities -- maximum isolation. */
  minimal: new CapabilitySet([]),

  /** Outbound Internet access only. */
  network: new CapabilitySet([AppContainerCapability.InternetClient]),

  /** Outbound Internet + Documents library + removable storage. */
  'full-io': new CapabilitySet([
    AppContainerCapability.InternetClient,
    AppContainerCapability.InternetClientServer,
    AppContainerCapability.DocumentsLibrary,
    AppContainerCapability.RemovableStorage,
  ]),
} as const;

/**
 * Maps a {@link CapabilitySet} to the unified {@link SandboxCapabilities}
 * descriptor used by the sandbox driver interface.
 */
export function mapToSandboxCapabilities(
  caps: CapabilitySet,
): SandboxCapabilities {
  const isolationLevels: IsolationLevel[] = [IsolationLevel.FileSystem];

  if (!caps.hasNetworkAccess()) {
    isolationLevels.push(IsolationLevel.Network);
  }

  // AppContainer always provides process-level isolation on Windows.
  isolationLevels.push(IsolationLevel.Full);

  return {
    isolationLevels,
    fileSystemIsolation: true,
    networkIsolation: !caps.hasNetworkAccess(),
    processIsolation: true,
    mountSupport: false,
    envForwarding: true,
    portForwarding: false,
    platforms: ['win32'],
  };
}
