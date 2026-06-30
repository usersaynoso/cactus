#!/usr/bin/env node
/**
 * Clones all modules listed in modules.json into the /modules directory.
 *
 * On Vercel: always does a fresh --depth=1 clone so the build always gets the latest module code.
 * Locally: tries `git -C <moduleDir> checkout HEAD -- .` first (fast path, no network).
 *          Falls back to a fresh shallow clone if that fails.
 */

import { readFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const modulesDir = join(rootDir, 'modules')

const registryPath = join(rootDir, 'modules.json')
if (!existsSync(registryPath)) {
  console.log('[checkout-modules] No modules.json found — nothing to do.')
  process.exit(0)
}

const registry = JSON.parse(readFileSync(registryPath, 'utf8'))
const entries = registry.modules ?? []

if (entries.length === 0) {
  console.log('[checkout-modules] No modules registered in modules.json.')
  process.exit(0)
}

const isVercel = process.env.VERCEL === '1'

for (const { name, repoUrl } of entries) {
  if (!name || !repoUrl) {
    console.warn('[checkout-modules] Skipping entry with missing name or repoUrl:', { name, repoUrl })
    continue
  }

  const moduleDir = join(modulesDir, name)

  if (isVercel) {
    console.log(`[checkout-modules] ${name}: Vercel build — cloning ${repoUrl}…`)
    try { rmSync(moduleDir, { recursive: true, force: true }) } catch {}
    mkdirSync(modulesDir, { recursive: true })

    const clone = spawnSync('git', ['clone', '--depth=1', repoUrl, moduleDir], {
      stdio: 'inherit', shell: false,
    })

    if (clone.status !== 0) {
      console.error(`[checkout-modules] ${name}: clone failed — module pages will be missing`)
    } else {
      console.log(`[checkout-modules] ${name}: done`)
    }
    continue
  }

  // Local fast path: restore tracked files to HEAD without a network call.
  if (existsSync(moduleDir)) {
    console.log(`[checkout-modules] ${name}: attempting git checkout HEAD -- .`)
    const checkout = spawnSync('git', ['-C', moduleDir, 'checkout', 'HEAD', '--', '.'], {
      stdio: 'pipe', shell: false,
    })

    if (checkout.status === 0) {
      console.log(`[checkout-modules] ${name}: checkout succeeded`)
      continue
    }

    const stderr = checkout.stderr?.toString().trim().split('\n')[0] ?? ''
    console.log(`[checkout-modules] ${name}: checkout failed — ${stderr}`)
  }

  console.log(`[checkout-modules] ${name}: cloning from ${repoUrl}…`)
  try { rmSync(moduleDir, { recursive: true, force: true }) } catch {}
  mkdirSync(modulesDir, { recursive: true })

  const clone = spawnSync('git', ['clone', '--depth=1', repoUrl, moduleDir], {
    stdio: 'inherit', shell: false,
  })

  if (clone.status !== 0) {
    console.error(`[checkout-modules] ${name}: clone failed — module pages will be missing`)
    continue
  }

  console.log(`[checkout-modules] ${name}: done`)
}
