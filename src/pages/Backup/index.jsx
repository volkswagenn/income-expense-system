import SectionCard from '../../components/shared/SectionCard'
import { BackupFull } from './BackupFull'
import LogDownloader from './LogDownloader'

export default function BackupPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">สำรองข้อมูล</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <SectionCard title="สำรองข้อมูลทั้งหมด">
          <BackupFull />
        </SectionCard>
        <SectionCard title="ดาวน์โหลดประวัติการใช้งาน">
          <LogDownloader />
        </SectionCard>
      </div>
    </div>
  )
}
