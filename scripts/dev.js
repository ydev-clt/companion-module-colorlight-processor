#!/usr/bin/env node
// Clean dist, mirror the WASM assets declared in build-config.cjs, then run
// the locally installed TypeScript compiler.
//   node scripts/dev.js          -> one-shot build
//   node scripts/dev.js --watch  -> copy assets + tsc --watch

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { extraFiles } = require('../build-config.cjs')

const ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'src')
const DST_DIR = path.join(ROOT, 'dist')

const watchMode = process.argv.includes('--watch')

fs.rmSync(DST_DIR, { recursive: true, force: true })

function mirrorFile(srcPath) {
  if (!srcPath || path.extname(srcPath) === '.ts') return
  const rel = path.relative(SRC_DIR, srcPath)
  const dstPath = path.join(DST_DIR, rel)
  fs.mkdirSync(path.dirname(dstPath), { recursive: true })
  fs.copyFileSync(srcPath, dstPath)
  console.log(`[copy] src/${rel} -> dist/${rel}`)
}

function mirrorDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) mirrorDir(full)
    else mirrorFile(full)
  }
}

function mirrorAssets() {
  if (typeof fs.globSync !== 'function') {
    // Older Node: the previous recursive mirror is a safe fallback.
    mirrorDir(SRC_DIR)
    return
  }
  for (const pattern of extraFiles) {
    for (const rel of fs.globSync(pattern, { cwd: ROOT })) mirrorFile(path.join(ROOT, rel))
  }
}

mirrorAssets()

function watchDir(dir, watchers) {
  if (watchers.has(dir)) return
  const watcher = fs.watch(dir, { persistent: true }, (_event, filename) => {
    if (!filename) return
    const name = filename.toString()
    if (name.endsWith('.ts')) return
    const full = path.join(dir, name)
    let stat
    try {
      stat = fs.statSync(full)
    } catch {
      return
    }
    if (stat.isDirectory()) {
      // New subdirectory: watch it and mirror its current contents.
      watchDir(full, watchers)
      mirrorDir(full)
    } else {
      mirrorFile(full)
    }
  })
  watchers.set(dir, watcher)
}

const watchers = new Map()
if (watchMode) watchDir(SRC_DIR, watchers)

const tscPath = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
const tscArgs = watchMode ? ['--watch'] : []
const tsc = spawn(process.execPath, [tscPath, ...tscArgs], { stdio: 'inherit' })

const shutdown = () => {
  tsc.kill()
  for (const watcher of watchers.values()) watcher.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
tsc.on('exit', (code) => process.exit(code ?? 0))
