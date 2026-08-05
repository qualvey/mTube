// 校验 client 源码里所有 t('...') 调用与 zh/en 语言包 key 对齐
import fs from 'fs'
import path from 'path'

const srcDir = 'packages/client/src'
const zh = JSON.parse(fs.readFileSync('packages/client/src/locales/zh.json', 'utf8'))
const en = JSON.parse(fs.readFileSync('packages/client/src/locales/en.json', 'utf8'))

const flatten = (obj, prefix = '') => {
  const keys = []
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'object' && v !== null) keys.push(...flatten(v, p))
    else keys.push(p)
  }
  return keys
}
const zhKeys = new Set(flatten(zh))
const enKeys = new Set(flatten(en))

// 提取 t('a.b.c') 静态调用
const used = new Set()
const files = []
const walk = (dir) => {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f)
    const st = fs.statSync(full)
    if (st.isDirectory()) walk(full)
    else if (/\.(vue|js)$/.test(f)) files.push(full)
  }
}
walk(srcDir)

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  const re = /\bt\(\s*'([a-zA-Z0-9_.]+)'/g
  let m
  while ((m = re.exec(src))) used.add(m[1])
}

let missing = []
for (const k of used) {
  if (!zhKeys.has(k)) missing.push(`[zh缺失] ${k}`)
  if (!enKeys.has(k)) missing.push(`[en缺失] ${k}`)
}

console.log(`t() 调用数: ${used.size}`)
console.log(`zh keys: ${zhKeys.size} | en keys: ${enKeys.size}`)
if (missing.length) {
  console.log('--- 缺失 key ---')
  missing.forEach(x => console.log(x))
  process.exit(1)
} else {
  console.log('✅ 所有静态 t() key 均在 zh/en 语言包中存在')
}
