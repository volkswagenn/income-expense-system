import SectionCard from '../../components/shared/SectionCard'
import { BackupFull } from './BackupFull'
import BackupSettings from './BackupSettings'
import LogDownloader from './LogDownloader'

export default function BackupPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">สำรองข้อมูล</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="💾 สำรองข้อมูลทั้งหมด">
          <BackupFull />
        </SectionCard>
        <SectionCard title="⚙️ สำรองเฉพาะการตั้งค่า">
          <BackupSettings />
        </SectionCard>
      </div>

      <SectionCard title="📋 ดาวน์โหลด Log">
        <LogDownloader />
      </SectionCard>
    </div>
  )
}
