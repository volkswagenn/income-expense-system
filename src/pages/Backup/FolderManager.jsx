import { useEffect, useMemo, useState } from 'react'
import useShopStore from '../../store/useShopStore'
import {
  ATTACHMENT_FOLDERS,
  ATTACHMENT_ROOT,
  getShopAttachmentFolder,
  getShopAttachmentRoot,
} from '../../lib/attachmentPaths'
import { getShopCode, getShopFolderName } from '../../lib/shopIdentity'

export default function FolderManager() {
  const { shops, activeShopId } = useShopStore()
  const [appRoot, setAppRoot] = useState(null)
  const [opening, setOpening] = useState(null)
  const [selectedShopId, setSelectedShopId] = useState(activeShopId ?? shops[0]?.id ?? '')
  const canOpenFolder = !!window.electronAPI?.openFolder

  useEffect(() => {
    if (!window.electronAPI?.getAppRoot) return
    window.electronAPI.getAppRoot().then(setAppRoot)
  }, [])

  useEffect(() => {
    if (selectedShopId && shops.some((shop) => shop.id === selectedShopId)) return
    setSelectedShopId(activeShopId ?? shops[0]?.id ?? '')
  }, [activeShopId, selectedShopId, shops])

  const selectedShop = useMemo(
    () => shops.find((shop) => shop.id === selectedShopId) ?? null,
    [selectedShopId, shops]
  )
  const selectedShopFolderName = getShopFolderName(selectedShop, shops)

  const sep = window.electronAPI?.platform === 'win32' ? '\\' : '/'

  const displayPath = (relativePath) => {
    const normalized = relativePath.split('/').join(sep)
    return appRoot ? `${appRoot}${sep}${normalized}` : `[โฟลเดอร์ App]${sep}${normalized}`
  }

  const handleOpen = async (key, folderPath) => {
    if (!canOpenFolder) return
    setOpening(key)
    await window.electronAPI.openFolder(folderPath)
    setOpening(null)
  }

  const renderFolderRow = ({ key, label, icon, desc }, folderPath, openKey) => (
    <div key={openKey} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-700">{icon} {label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
        <p className="text-xs font-mono text-gray-500 truncate mt-1 bg-white border border-gray-100 rounded px-2 py-1">
          {displayPath(folderPath)}
        </p>
      </div>
      <button
        className="btn btn-secondary text-xs shrink-0 flex items-center gap-1"
        onClick={() => handleOpen(openKey, folderPath)}
        disabled={!canOpenFolder || opening === openKey}
        title={canOpenFolder ? 'เปิดโฟลเดอร์' : 'ใช้ได้เมื่อเปิดผ่านโปรแกรม PC'}
      >
        📂 {opening === openKey ? 'กำลังเปิด...' : canOpenFolder ? 'เปิดโฟลเดอร์' : 'เปิดผ่าน PC'}
      </button>
    </div>
  )

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        ไฟล์แนบใหม่จะถูกแยกตามร้านในโฟลเดอร์เดียวกับโปรแกรม เมื่อย้ายโฟลเดอร์ของโปรแกรม ไฟล์ต่างๆ จะติดไปด้วยอัตโนมัติ
      </p>

      <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-900">เลือกร้านสำหรับเปิดโฟลเดอร์ไฟล์แนบ</p>
            <p className="text-xs text-blue-700 mt-0.5">ระบบจะบันทึกไฟล์ใหม่ไว้ใต้ shops/[รหัสร้าน-ชื่อร้าน]/...</p>
          </div>
          <select
            className="input sm:w-64"
            value={selectedShopId}
            onChange={(e) => setSelectedShopId(e.target.value)}
            disabled={shops.length === 0}
          >
            {shops.length === 0 ? (
              <option value="">ยังไม่มีร้าน</option>
            ) : (
              shops.map((shop) => (
                <option key={shop.id} value={shop.id}>{getShopCode(shop, shops)} - {shop.name}</option>
              ))
            )}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="btn btn-secondary text-xs"
            onClick={() => handleOpen('attachments-root', ATTACHMENT_ROOT)}
            disabled={!canOpenFolder || opening === 'attachments-root'}
            title={canOpenFolder ? 'เปิดโฟลเดอร์รวมทุกร้าน' : 'ใช้ได้เมื่อเปิดผ่านโปรแกรม PC'}
          >
            📁 เปิดโฟลเดอร์รวมทุกร้าน
          </button>
          {selectedShop && (
            <button
              className="btn btn-secondary text-xs"
              onClick={() => handleOpen('shop-root', getShopAttachmentRoot(selectedShopFolderName))}
              disabled={!canOpenFolder || opening === 'shop-root'}
              title={canOpenFolder ? 'เปิดโฟลเดอร์ร้านนี้' : 'ใช้ได้เมื่อเปิดผ่านโปรแกรม PC'}
            >
              🏪 เปิดโฟลเดอร์ร้านนี้
            </button>
          )}
        </div>
      </div>

      {selectedShop ? (
        <div className="space-y-3">
          {ATTACHMENT_FOLDERS.map((folder) =>
            renderFolderRow(
              folder,
              getShopAttachmentFolder(selectedShopFolderName, folder.key),
              `shop-${selectedShop.id}-${folder.key}`
            )
          )}
        </div>
      ) : (
        <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-500">
          ยังไม่มีร้านให้แยกโฟลเดอร์ สร้างร้านก่อนแล้วไฟล์แนบใหม่จะถูกจัดเข้าร้านโดยอัตโนมัติ
        </div>
      )}
    </div>
  )
}
