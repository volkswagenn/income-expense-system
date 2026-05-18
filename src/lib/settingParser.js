export function parseSettingFile(text) {
  const result = {}
  const lines = text.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([^=]+?)\s*=\s*(.+)$/)
    if (match) {
      result[match[1].trim()] = match[2].trim()
    }
  }
  return {
    version: result['File Version'] ?? '0.0.1',
    shopName: result['Name Shop'] ?? 'ร้านของฉัน',
  }
}
