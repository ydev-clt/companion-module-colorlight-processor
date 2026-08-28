#!/usr/bin/env node
// 入口脚本：清理 dist，把 src 下所有非 .ts 文件镜像到 dist 对应位置，
// 然后按需调用 `tsc` 或 `tsc --watch`。
// 用法：
//   node scripts/dev.js          → 构建一次（等价 `rimraf dist && tsc`），可被 build 命令复用
//   node scripts/dev.js --watch  → 监听 src 中所有非 .ts 文件 + 启动 `tsc --watch`（开发模式）

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'src')
const DST_DIR = path.join(ROOT, 'dist')

const watchMode = process.argv.includes('--watch')

// 1) 清空 dist（等价于 `rimraf dist`）
fs.rmSync(DST_DIR, { recursive: true, force: true })

// 2) 把 src 下的单个文件镜像到 dist，保持目录结构（跳过 .ts）
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

// 3) 初次全量镜像
mirrorDir(SRC_DIR)

// 4) 监听模式：递归监听 src 下所有子目录
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
      // 新建子目录：补上监听并把目录里的内容镜像过去
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

// 5) 启动 tsc（监听模式下加 --watch）
const isWin = process.platform === 'win32'
const tscArgs = ['tsc']
if (watchMode) tscArgs.push('--watch')

const tsc = spawn(isWin ? 'npx.cmd' : 'npx', tscArgs, {
  stdio: 'inherit',
  shell: isWin,
})

const shutdown = () => {
  tsc.kill()
  for (const watcher of watchers.values()) watcher.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
tsc.on('exit', (code) => process.exit(code ?? 0))