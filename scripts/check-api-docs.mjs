#!/usr/bin/env node
/**
 * check-api-docs.mjs — 接口文档同步检查
 *
 * 扫描 packages/server/src 下所有路由注册 (app.* / router.*),
 * 提取完整 API 路径,与文档(doc/api_specification.md、doc/api/admin.md、docs/*.md)比对。
 *
 * 模式:
 *   默认(增量) — 配合 pre-commit: 仅检查本次暂存改动中 新增/变更 的路由,
 *                 发现新接口未写入文档 → 退出码 1,阻止提交。
 *   --full      — 全量检查所有已注册接口的文档覆盖情况,用于 CI / 手动核对。
 *
 * 用法: node scripts/check-api-docs.mjs [--full]
 */

import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SERVER_SRC = join(ROOT, 'packages', 'server', 'src')
const DOC_GLOBS = [
  join(ROOT, 'doc', 'api_specification.md'),
  join(ROOT, 'doc', 'api', 'admin.md'),
  join(ROOT, 'docs', '*.md'),
]
const ROUTER_PREFIX = '/api/v1/paywall' // paywallRouter 挂载点
const FULL = process.argv.includes('--full')

/** 递归收集 .js 文件(排除 *.test.js) */
function collectJs(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...collectJs(full))
    } else if (name.endsWith('.js') && !name.includes('.test.')) {
      out.push(full)
    }
  }
  return out
}

/** 从一行源码提取路由定义:[{ method, path }] */
function extractRoutes(line) {
  const routes = []
  const single = line.match(/(?:app|router)\.(get|post|put|delete|all)\(\s*'([^']+)'\s*,/)
  if (single) {
    routes.push({ method: single[1].toUpperCase(), path: single[2] })
    return routes
  }
  const multi = line.match(/(?:app|router)\.(all)\(\s*\[([^\]]+)\]\s*,/)
  if (multi) {
    const paths = [...multi[2].matchAll(/'([^']+)'/g)].map(m => m[1])
    for (const p of paths) routes.push({ method: multi[1].toUpperCase(), path: p })
  }
  return routes
}

/** router.* 补全挂载前缀 */
function fullPath(path) {
  return path.startsWith('/api/') ? path : ROUTER_PREFIX + path
}

/** 收集全部注册接口 */
function collectAllRoutes() {
  const routes = []
  for (const file of collectJs(SERVER_SRC)) {
    const content = readFileSync(file, 'utf8')
    for (const line of content.split('\n')) {
      for (const r of extractRoutes(line)) {
        routes.push({ ...r, path: fullPath(r.path), file: relative(ROOT, file) })
      }
    }
  }
  return routes
}

/** 读取全部文档内容 */
function readDocs() {
  let text = ''
  for (const g of DOC_GLOBS) {
    const base = g.endsWith('*.md') ? join(ROOT, 'docs') : g
    const files = g.endsWith('*.md')
      ? readdirSync(base).filter(f => f.endsWith('.md')).map(f => join(base, f))
      : [g]
    for (const f of files) text += readFileSync(f, 'utf8') + '\n'
  }
  return text
}

/** 增量模式:取暂存区改动行中出现的路由 */
function collectStagedRoutes() {
  let diff = ''
  try {
    diff = execSync('git diff --cached -U0 -- packages/server', { encoding: 'utf8', cwd: ROOT })
  } catch {
    return { routes: [], error: '无法读取 git 暂存区(git diff --cached 失败)' }
  }
  const routes = []
  for (const line of diff.split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue
    for (const r of extractRoutes(line.slice(1))) {
      routes.push({ ...r, path: fullPath(r.path), file: '(staged)' })
    }
  }
  return { routes, error: null }
}

// —— 主流程 ——
const allRoutes = collectAllRoutes()
const docs = readDocs()

let targets, modeLabel
if (FULL) {
  targets = allRoutes
  modeLabel = '全量检查'
} else {
  const { routes, error } = collectStagedRoutes()
  if (error) {
    console.error(`⚠️  ${error} — 已跳过增量检查。`)
    process.exit(0)
  }
  targets = routes
  modeLabel = '增量检查(staged)'
}

// 去重(同 path 多方法只报一次,文档通常按路径写)
const seen = new Set()
const unique = targets.filter(r => {
  if (seen.has(r.path)) return false
  seen.add(r.path)
  return true
})

const missing = unique.filter(r => !docs.includes(r.path))

console.log(`🔍 ${modeLabel}: 共 ${unique.length} 个路由,文档覆盖缺失 ${missing.length} 个`)

if (missing.length > 0) {
  console.error('❌ 以下接口未写入文档,请同步更新 doc/api_specification.md / doc/api/admin.md:')
  for (const m of missing) {
    console.error(`   [${m.method}] ${m.path}`)
  }
  if (FULL) {
    console.error('\n(全量模式: 仓库可能存在历史文档缺口,请逐步补齐或确认为内部接口)')
  } else {
    console.error('\n提交被拦截: 先补充接口文档,再重新 commit。')
  }
  process.exit(1)
}

console.log('✅ 接口文档同步检查通过')
