import { readFileSync, writeFileSync } from 'node:fs'
const f = 'packages/server/src/db.js'
let s = readFileSync(f, 'utf8')

// 把误插进 SQL 模板字符串内的 try/catch 移到字符串外（99 行 ` 之后）
const bad = `  );

try {
  database.exec("ALTER TABLE menus ADD COLUMN visibility TEXT DEFAULT 'all';")
} catch (e) {
  // Column already exists
}

`)`
const good = `  );
`)

try {
  database.exec("ALTER TABLE menus ADD COLUMN visibility TEXT DEFAULT 'all';")
} catch (e) {
  // Column already exists
}

database.exec(`
  CREATE TABLE IF NOT EXISTS plans (`
// 需要保留 plans 的 CREATE 开头——用替换，bad 里包含 ")` 到 plans 前
// 简化：bad 以 `  );` 开头、以 `\`)` 结尾；替换后跟 plans CREATE
if (s.split(bad).length - 1 !== 1) {
  console.error('bad anchor:', s.split(bad).length - 1)
  process.exit(1)
}
s = s.split(bad).join(good.replace('CREATE TABLE IF NOT EXISTS plans (', 'CREATE TABLE IF NOT EXISTS plans ('))
writeFileSync(f, s)
console.log('✓ ALTER 移出 SQL 字符串')
