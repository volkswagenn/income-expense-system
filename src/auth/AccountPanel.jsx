import { useState } from 'react'
import Icon from '../components/shared/Icon'
import { useAuth } from './AuthProvider'

const ROLE_LABEL = {
  owner: 'เจ้าของร้าน — จัดการได้ทุกอย่าง',
  editor: 'ผู้บันทึก — บันทึกและแก้ไขข้อมูลได้',
  viewer: 'ผู้ดู — ดูได้อย่างเดียว แก้ไขไม่ได้',
}

export default function AccountPanel() {
  const { user, profile, shop, role, changePassword, signOut } = useAuth()

  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState(null) // { type: 'ok' | 'error', text }
  const [busy, setBusy] = useState(false)

  async function handleChangePassword(e) {
    e.preventDefault()
    setMsg(null)

    if (pw1.length < 6) {
      setMsg({ type: 'error', text: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' })
      return
    }
    if (pw1 !== pw2) {
      setMsg({ type: 'error', text: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน' })
      return
    }

    setBusy(true)
    try {
      await changePassword(pw1)
      setPw1('')
      setPw2('')
      setMsg({ type: 'ok', text: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว ครั้งต่อไปให้ใช้รหัสใหม่' })
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-title">บัญชีของคุณ</h2>
        <dl className="mt-3 rounded-xl border border-gray-200 divide-y divide-gray-100 text-sm">
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-gray-500">อีเมล</dt>
            <dd className="font-medium text-gray-900 text-right break-all">{user?.email}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-gray-500">ชื่อที่แสดง</dt>
            <dd className="font-medium text-gray-900 text-right">{profile?.display_name ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-gray-500">ร้าน</dt>
            <dd className="font-medium text-gray-900 text-right">{shop?.name ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-gray-500">สิทธิ์</dt>
            <dd className="font-medium text-gray-900 text-right">{ROLE_LABEL[role] ?? role ?? '—'}</dd>
          </div>
        </dl>
      </div>

      <form onSubmit={handleChangePassword} className="border-t pt-6 space-y-4">
        <div>
          <h2 className="section-title">เปลี่ยนรหัสผ่าน</h2>
          <p className="text-sm text-gray-600 mt-1">
            ถ้าเพิ่งได้รหัสผ่านชั่วคราวมาจากเจ้าของร้าน ควรเปลี่ยนเป็นรหัสของตัวเองทันที
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 sm:max-w-xl">
          <div>
            <label className="label">รหัสผ่านใหม่</label>
            <input
              className="input"
              type="password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              autoComplete="new-password"
              placeholder="อย่างน้อย 6 ตัวอักษร"
            />
          </div>
          <div>
            <label className="label">ยืนยันรหัสผ่านใหม่</label>
            <input
              className="input"
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              autoComplete="new-password"
              placeholder="พิมพ์ซ้ำอีกครั้ง"
            />
          </div>
        </div>

        {msg && (
          <p
            className={`text-sm rounded-xl px-4 py-2 border ${
              msg.type === 'ok'
                ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                : 'text-red-600 bg-red-50 border-red-200'
            }`}
          >
            {msg.text}
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'กำลังบันทึก…' : 'เปลี่ยนรหัสผ่าน'}
        </button>
      </form>

      <div className="border-t pt-6">
        <button
          type="button"
          onClick={signOut}
          className="btn btn-ghost text-red-600"
        >
          <Icon name="logout" size={17} /> ออกจากระบบ
        </button>
      </div>
    </div>
  )
}
