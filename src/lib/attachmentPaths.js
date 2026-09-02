import { attachmentFolder } from './api/attachments'

/**
 * โครงพาธของไฟล์แนบบน Storage: <shop_id>/<ประเภท>/<ปี>/<เดือน>/<ชื่อไฟล์>
 * ต้องตรงกับที่ policy ของ bucket 'attachments' คาดไว้ (ดู policies.sql)
 * ตัวจริงอยู่ที่ api/attachments.js — ไฟล์นี้เหลือไว้ให้โค้ดเดิมที่ import ชื่อนี้อยู่
 */
export function getDatedAttachmentFolder(folderBase, createdAt) {
  return attachmentFolder(folderBase, createdAt)
}
