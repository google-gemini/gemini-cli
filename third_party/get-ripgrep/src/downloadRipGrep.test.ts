/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Writable, Readable } from 'node:stream'
import fs from 'node:fs'
import { downloadRipGrep } from './downloadRipGrep.js'
import { execa } from 'execa'
import extractZip from 'extract-zip'
import fsExtra from 'fs-extra'
import got from 'got'
import * as os from 'node:os'
import { pathExists } from 'path-exists'
import { pipeline } from 'node:stream/promises'

// Mock dependencies before any imports
vi.mock('execa', () => ({
  execa: vi.fn(),
}))

vi.mock('extract-zip', () => ({
  default: vi.fn(),
}))

vi.mock('fs-extra', () => ({
  default: {
    mkdir: vi.fn(),
    createWriteStream: vi.fn(() => new Writable()),
    move: vi.fn(),
    mkdtemp: vi.fn(async (prefix) => `${prefix}`),
    rm: vi.fn(),
  },
}))

vi.mock('got', () => ({
  default: {
    stream: vi.fn(),
  },
}))

vi.mock('node:os', () => ({
  platform: vi.fn(),
  arch: vi.fn(),
}))

vi.mock('path-exists', () => ({
  pathExists: vi.fn(),
}))

vi.mock('node:stream/promises', () => ({
  pipeline: vi.fn(),
}))

vi.mock('xdg-basedir', () => ({
  xdgCache: `./mocked/cache`,
}))

describe('downloadRipGrep', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Mock got.stream to return a real, empty readable stream
    const mockStream = new Readable({
      read() {
        this.push(null) // Signal end of stream
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(got.stream).mockReturnValue(mockStream as any)
    vi.mocked(pipeline).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync('./test/bin', { recursive: true, force: true })
    fs.rmSync('./mocked', { recursive: true, force: true })
  })

  const testMatrix = [
    {
      platform: 'darwin',
      arch: 'arm64',
      target: 'aarch64-apple-darwin.tar.gz',
    },
    { platform: 'darwin', arch: 'x64', target: 'x86_64-apple-darwin.tar.gz' },
    { platform: 'win32', arch: 'x64', target: 'x86_64-pc-windows-msvc.zip' },
    { platform: 'win32', arch: 'arm', target: 'aarch64-pc-windows-msvc.zip' },
    {
      platform: 'linux',
      arch: 'x64',
      target: 'x86_64-unknown-linux-musl.tar.gz',
    },
    {
      platform: 'linux',
      arch: 'arm64',
      target: 'aarch64-unknown-linux-gnu.tar.gz',
    },
  ]

  for (const { platform, arch, target } of testMatrix) {
    it(`should download and extract for ${platform}-${arch}`, async () => {
      vi.mocked(os.platform).mockReturnValue(platform as NodeJS.Platform)
      vi.mocked(os.arch).mockReturnValue(arch)
      vi.mocked(pathExists).mockResolvedValue(false)

      const binPath = './test/bin'
      await downloadRipGrep(binPath)

      const version = 'v13.0.0-10'
      const expectedUrl = `https://github.com/microsoft/ripgrep-prebuilt/releases/download/${version}/ripgrep-${version}-${target}`
      const expectedDownloadPath = `./mocked/cache/vscode-ripgrep/ripgrep-${version}-${target}`

      // Check download
      expect(got.stream).toHaveBeenCalledWith(expectedUrl)
      expect(pipeline).toHaveBeenCalled()

      // Check extraction
      if (target.endsWith('.tar.gz')) {
        expect(execa).toHaveBeenCalledWith('tar', [
          'xvf',
          expectedDownloadPath,
          '-C',
          binPath,
        ])
        expect(extractZip).not.toHaveBeenCalled()
      } else if (target.endsWith('.zip')) {
        expect(extractZip).toHaveBeenCalledWith(expectedDownloadPath, {
          dir: binPath,
        })
        expect(execa).not.toHaveBeenCalled()
      }
    })
  }

  it('should use the cached file if it exists', async () => {
    vi.mocked(os.platform).mockReturnValue('linux')
    vi.mocked(os.arch).mockReturnValue('x64')
    vi.mocked(pathExists).mockResolvedValue(true)

    const binPath = './test/bin'
    await downloadRipGrep(binPath)

    expect(got.stream).not.toHaveBeenCalled()
    expect(pipeline).not.toHaveBeenCalled()
    expect(execa).toHaveBeenCalled() // Still extracts
  })

  it('should throw an error for an unknown platform', async () => {
    vi.mocked(os.platform).mockReturnValue('sunos' as NodeJS.Platform) // an unsupported platform
    vi.mocked(os.arch).mockReturnValue('x64')

    await expect(downloadRipGrep('./test/bin')).rejects.toThrow(
      'Unknown platform: sunos',
    )
  })

  it('should clean up temporary files on successful download', async () => {
    vi.mocked(os.platform).mockReturnValue('linux')
    vi.mocked(os.arch).mockReturnValue('x64')
    vi.mocked(pathExists).mockResolvedValue(false)

    await downloadRipGrep('./test/bin')

    expect(fsExtra.mkdtemp).toHaveBeenCalledWith('download-ripgrep')
    expect(fsExtra.rm).toHaveBeenCalledWith('download-ripgrep', {
      recursive: true,
      force: true,
    })
  })
})
