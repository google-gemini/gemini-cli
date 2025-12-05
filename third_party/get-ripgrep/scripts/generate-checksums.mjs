/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-env node */

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createHash } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import got from 'got'

const { console } = globalThis
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DEFAULT_REPOSITORY = 'microsoft/ripgrep-prebuilt'
const DEFAULT_VERSION = process.env.RIPGREP_VERSION || 'v13.0.0-10'
const DEFAULT_OUTPUT = path.resolve(__dirname, '../ripgrep-checksums.json')

const ALL_TARGETS = [
  'aarch64-apple-darwin.tar.gz',
  'x86_64-apple-darwin.tar.gz',
  'x86_64-pc-windows-msvc.zip',
  'aarch64-pc-windows-msvc.zip',
  'i686-pc-windows-msvc.zip',
  'x86_64-unknown-linux-musl.tar.gz',
  'arm-unknown-linux-gnueabihf.tar.gz',
  'aarch64-unknown-linux-gnu.tar.gz',
  'powerpc64le-unknown-linux-gnu.tar.gz',
  's390x-unknown-linux-gnu.tar.gz',
  'i686-unknown-linux-musl.tar.gz',
]

function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    repository: DEFAULT_REPOSITORY,
    version: DEFAULT_VERSION,
    output: DEFAULT_OUTPUT,
    targets: [...ALL_TARGETS],
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    switch (arg) {
      case '--repository':
      case '-r': {
        if (!args[i + 1]) {
          throw new Error(`Missing value for ${arg}`)
        }
        options.repository = args[i + 1]
        i += 1
        break
      }
      case '--version':
      case '-v': {
        if (!args[i + 1]) {
          throw new Error(`Missing value for ${arg}`)
        }
        options.version = args[i + 1]
        i += 1
        break
      }
      case '--output':
      case '-o': {
        if (!args[i + 1]) {
          throw new Error(`Missing value for ${arg}`)
        }
        options.output = path.resolve(process.cwd(), args[i + 1])
        i += 1
        break
      }
      case '--targets': {
        if (!args[i + 1]) {
          throw new Error(`Missing value for ${arg}`)
        }
        options.targets = args[i + 1]
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
        i += 1
        break
      }
      case '--help':
      case '-h': {
        printHelp()
        process.exit(0)
        break
      }
      default: {
        throw new Error(`Unknown argument: ${arg}`)
      }
    }
  }

  if (options.targets.length === 0) {
    throw new Error('At least one target must be specified.')
  }

  return options
}

function printHelp() {
  console.log(`Usage: node generate-checksums.mjs [options]

Options:
  -r, --repository <owner/name>   GitHub repository providing ripgrep assets
  -v, --version <tag>             Release tag to download (default: ${DEFAULT_VERSION})
  -o, --output <path>             Output file path for checksum manifest
      --targets <list>            Comma-separated list of archive targets to download
  -h, --help                      Print this help message
`)
}

async function downloadAndHash(url) {
  const hash = createHash('sha256')

  await pipeline(got.stream(url), hash)

  return hash.digest('hex')
}

async function writeChecksums({ repository, version, targets, output }) {
  console.log(`Generating checksums for ${repository}@${version}`)

  const assets = {}
  for (const target of targets) {
    const assetName = `ripgrep-${version}-${target}`
    const url = `https://github.com/${repository}/releases/download/${version}/${assetName}`

    console.log(`  • ${assetName}`)
    const sha256 = await downloadAndHash(url)

    assets[target] = {
      url,
      sha256,
    }
  }

  const manifest = {
    repository,
    version,
    generatedAt: new Date().toISOString(),
    assets,
  }

  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  console.log(`Wrote checksum manifest to ${output}`)
}

async function main() {
  try {
    const options = parseArgs()
    await writeChecksums(options)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

await main()
