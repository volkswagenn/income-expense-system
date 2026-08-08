export const ATTACHMENT_ROOT = 'attachments'

export function getAttachmentFolder(folderBase) {
  return `${ATTACHMENT_ROOT}/${folderBase}`
}

export function getDatedAttachmentFolder(folderBase, createdAt) {
  const d = new Date(createdAt ?? Date.now())
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${getAttachmentFolder(folderBase)}/${year}/${month}`
}
