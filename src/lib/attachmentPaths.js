export const ATTACHMENT_ROOT = 'shops'
export const UNASSIGNED_SHOP_ID = 'unassigned'

export const ATTACHMENT_FOLDERS = [
  { key: 'receipts', label: 'ใบเสร็จ', icon: '🧾', desc: 'ไฟล์ใบเสร็จที่อัปโหลด' },
  { key: 'taxinvoices', label: 'ใบกำกับภาษี', icon: '📑', desc: 'ไฟล์ใบกำกับภาษีที่อัปโหลด' },
]

export function normalizeShopFolder(folderName) {
  return folderName || UNASSIGNED_SHOP_ID
}

export function getShopAttachmentRoot(shopFolderName) {
  return `${ATTACHMENT_ROOT}/${normalizeShopFolder(shopFolderName)}`
}

export function getShopAttachmentFolder(shopFolderName, folderBase) {
  return `${getShopAttachmentRoot(shopFolderName)}/${folderBase}`
}

export function getDatedAttachmentFolder(shopFolderName, folderBase, createdAt) {
  const d = new Date(createdAt ?? Date.now())
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${getShopAttachmentFolder(shopFolderName, folderBase)}/${year}/${month}`
}
