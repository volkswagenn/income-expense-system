export function makeShopCode(number) {
  return `id${String(Math.max(1, number)).padStart(3, '0')}`
}

export function getNextShopCode(shops = []) {
  const max = shops.reduce((highest, shop) => {
    const match = String(shop.code ?? '').match(/^id(\d+)$/i)
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 0)
  return makeShopCode(max + 1)
}

export function assignMissingShopCodes(shops = []) {
  const used = new Set()
  let nextNumber = 1

  return shops.map((shop) => {
    if (shop.code && !used.has(shop.code)) {
      used.add(shop.code)
      return shop
    }

    while (used.has(makeShopCode(nextNumber))) nextNumber += 1
    const code = makeShopCode(nextNumber)
    used.add(code)
    nextNumber += 1
    return { ...shop, code }
  })
}

export function getShopCode(shop, shops = []) {
  if (shop?.code) return shop.code
  const index = shops.findIndex((item) => item.id === shop?.id)
  return makeShopCode(index >= 0 ? index + 1 : shops.length + 1)
}

export function sanitizeFolderPart(value) {
  return String(value ?? '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}

export function getShopFolderName(shop, shops = []) {
  if (!shop) return 'unassigned'
  const code = getShopCode(shop, shops)
  const name = sanitizeFolderPart(shop.name)
  return name ? `${code}-${name}` : code
}
