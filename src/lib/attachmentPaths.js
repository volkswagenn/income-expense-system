/**
 * โครงพาธของไฟล์แนบ: attachments/<ประเภท>/<ปี>/<เดือน>/<ชื่อไฟล์>
 * ต้องตรงกับที่ policy ของ bucket 'attachments' คาดไว้ (ดู policies.sql)
 */
export function getDatedAttachmentFolder(folderBase, createdAt) {
  const d = new Date(createdAt ?? Date.now())
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `attachments/${folderBase}/${year}/${month}`
}
