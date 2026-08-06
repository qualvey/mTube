// Standard API response helper
export const sendResponse = (res, data, code = 200, message = 'success') => {
  if (res.headersSent) return
  res.status(code).json({ code, message, data })
}
