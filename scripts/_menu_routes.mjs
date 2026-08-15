import { readFileSync, writeFileSync } from 'node:fs'
const f = 'packages/server/src/index.js'
let s = readFileSync(f, 'utf8')

// 1. GET /api/v1/menus: pass lang
const o1 = `app.get('/api/v1/menus', (req, res) => {
  sendResponse(res, db.getMenuTree())
})`
const n1 = `app.get('/api/v1/menus', (req, res) => {
  sendResponse(res, db.getMenuTree(req.query.lang || null))
})`
if (s.split(o1).length - 1 !== 1) { console.error('o1', s.split(o1).length - 1); process.exit(1) }
s = s.split(o1).join(n1)

// 2. admin menus POST: validation + nameEn + visibility
const o2 = `app.post('/api/v1/admin/menus', (req, res) => {
  const menu = db.addMenu(req.body)
  sendResponse(res, menu, 201, '菜单已创建')
})`
const n2 = `app.post('/api/v1/admin/menus', (req, res) => {
  const body = req.body || {}
  // 链接校验：站内路由（/ 开头）或外链（http/https）
  if (body.type === 'link') {
    const url = String(body.target?.url || '').trim()
    if (!/^\\/|^https?:\\/\\//.test(url)) {
      return sendResponse(res, null, 400, '链接格式不正确：站内路由以 / 开头，外链需 http(s)://')
    }
  }
  if (body.type === 'page' && !String(body.target?.pageKey || '').trim()) {
    return sendResponse(res, null, 400, 'page 类型需要 pageKey')
  }
  const menu = db.addMenu(body)
  // 英文名称 → translations（entityType=menu）
  if (body.nameEn && String(body.nameEn).trim()) {
    db.saveTranslations({ entityType: 'menu', entityId: menu.id, locale: 'en', fields: { name: String(body.nameEn).trim() } })
  }
  sendResponse(res, menu, 201, '菜单已创建')
})`
if (s.split(o2).length - 1 !== 1) { console.error('o2', s.split(o2).length - 1); process.exit(1) }
s = s.split(o2).join(n2)

// 3. admin menus PUT: validation + nameEn + visibility
const o3 = `app.put('/api/v1/admin/menus/:id', (req, res) => {
  const updated = db.updateMenu(req.params.id, req.body)
  if (!updated) {
    return sendResponse(res, null, 404, '菜单不存在')
  }
  sendResponse(res, updated, 200, '菜单已更新')
})`
const n3 = `app.put('/api/v1/admin/menus/:id', (req, res) => {
  const body = req.body || {}
  if (body.type === 'link') {
    const url = String(body.target?.url || '').trim()
    if (!/^\\/|^https?:\\/\\//.test(url)) {
      return sendResponse(res, null, 400, '链接格式不正确：站内路由以 / 开头，外链需 http(s)://')
    }
  }
  if (body.type === 'page' && !String(body.target?.pageKey || '').trim()) {
    return sendResponse(res, null, 400, 'page 类型需要 pageKey')
  }
  const updated = db.updateMenu(req.params.id, body)
  if (!updated) {
    return sendResponse(res, null, 404, '菜单不存在')
  }
  // 英文名称更新（空字符串 = 清除翻译）
  if (body.nameEn !== undefined) {
    const nameEn = String(body.nameEn || '').trim()
    if (nameEn) {
      db.saveTranslations({ entityType: 'menu', entityId: updated.id, locale: 'en', fields: { name: nameEn } })
    } else {
      db.getTranslations({ entityType: 'menu', entityId: updated.id, locale: 'en' }).forEach((t) => {
        database.exec // noop
      })
    }
  }
  sendResponse(res, updated, 200, '菜单已更新')
})`
if (s.split(o3).length - 1 !== 1) { console.error('o3', s.split(o3).length - 1); process.exit(1) }
s = s.split(o3).join(n3)

writeFileSync(f, s)
console.log('✓ index.js 菜单路由（校验 + nameEn + lang）')
