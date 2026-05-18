import { useState } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { generateDateRows } from '../../lib/importProcessor'
import ImportFormDaily from './ImportFormDaily'
import ImportFormByType from './ImportFormByType'
import ImportFormSummary from './ImportFormSummary'
import ImportUploader from './ImportUploader'
import SectionCard from '../../components/shared/SectionCard'
import DateRangeFilter from '../../components/shared/DateRangeFilter'

const FORM_TYPES = [
  { key: 'daily',   label: 'รายรับรวมตามรายวัน' },
  { key: 'bytype',  label: 'รายรับแยกประเภท' },
  { key: 'summary', label: 'รายรับ-รายจ่ายรวม' },
]

export default function ImportPage() {
  const [filter, setFilter] = useState('month')
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [formType, setFormType] = useState('daily')
  const [rows, setRows] = useState(null)
  const [showUploader, setShowUploader] = useState(false)

  const handleGenerate = () => {
    setShowUploader(false)
    const generated = generateDateRows(startDate, endDate)
    if (formType === 'daily') {
      setRows(generated.map((r) => ({ date: r.date, total: '', note: '' })))
    } else if (formType === 'bytype') {
      setRows(generated.map((r) => ({ date: r.date, cash: '', transfer: '', other: '', note: '' })))
    } else {
      setRows(generated.map((r) => ({ date: r.date, income: '', expense: '', note: '' })))
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">นำเข้าข้อมูล</h1>

      <SectionCard title="เลือกช่วงเวลาและแบบฟอร์ม">
        <div className="space-y-4">
          <DateRangeFilter
            filter={filter} setFilter={setFilter}
            startDate={startDate} endDate={endDate}
            setStartDate={setStartDate} setEndDate={setEndDate}
          />
          <div>
            <label className="label">แบบฟอร์มการนำเข้า</label>
            <div className="flex flex-wrap gap-2">
              {FORM_TYPES.map((f) => (
                <button
                  key={f.key}
                  className={`btn text-sm ${formType === f.key ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => { setFormType(f.key); setRows(null); setShowUploader(false) }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleGenerate}>สร้างแบบฟอร์ม →</button>
        </div>
      </SectionCard>

      {rows && (
        <SectionCard title={`แบบฟอร์ม: ${FORM_TYPES.find((f) => f.key === formType)?.label}`}>
          {formType === 'daily' && (
            <ImportFormDaily
              rows={rows} setRows={setRows}
              startDate={startDate} endDate={endDate}
              showUploader={showUploader} setShowUploader={setShowUploader}
            />
          )}
          {formType === 'bytype' && (
            <ImportFormByType
              rows={rows} setRows={setRows}
              startDate={startDate} endDate={endDate}
              showUploader={showUploader} setShowUploader={setShowUploader}
            />
          )}
          {formType === 'summary' && (
            <ImportFormSummary
              rows={rows} setRows={setRows}
              startDate={startDate} endDate={endDate}
              showUploader={showUploader} setShowUploader={setShowUploader}
            />
          )}
        </SectionCard>
      )}

      {/* Global upload section (direct DB import with overwrite checklist) */}
      <SectionCard title="อัปโหลดไฟล์ข้อมูล (นำเข้าตรง)">
        <div className="space-y-3">
          <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg p-2">
            อัปโหลด CSV / Excel ที่กรอกข้อมูลแล้ว → ตรวจสอบและนำเข้าโดยตรง (ไม่ผ่านฟอร์ม)
          </p>
          <ImportUploader formType={formType} />
        </div>
      </SectionCard>
    </div>
  )
}
