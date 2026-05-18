import SectionCard from '../../components/shared/SectionCard'
import { BackupCurrentShop } from './BackupFull'
import BackupSettings from './BackupSettings'
import LogDownloader from './LogDownloader'
import FolderManager from './FolderManager'
import useShopStore from '../../store/useShopStore'

export default function BackupPage() {
  const { getActiveShop } = useShopStore()
  const activeShop = getActiveShop()

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">สำรองข้อมูล</h1>

      {/* Per-shop backup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title={`💾 สำรองข้อมูลร้านนี้${activeShop ? ` — ${activeShop.name}` : ''}`}>
          <BackupCurrentShop />
        </SectionCard>
        <SectionCard title="⚙️ สำรองเฉพาะการตั้งค่า">
          <BackupSettings />
        </SectionCard>
      </div>

      <SectionCard title="📁 โฟลเดอร์ไฟล์แนบ">
        <FolderManager />
      </SectionCard>

      <SectionCard title="📋 ดาวน์โหลด Log">
        <LogDownloader />
      </SectionCard>
    </div>
  )
}
