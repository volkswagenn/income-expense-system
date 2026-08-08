import { useState } from 'react'
import Icon from '../components/shared/Icon'
import { useAuth } from './AuthProvider'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      await signIn(email, password)
      // ไม่ต้อง navigate เอง — AuthProvider จับ session ได้แล้วจะสลับหน้าให้
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-7">
          <div className="w-14 h-14 rounded-panel bg-ink flex items-center justify-center mx-auto mb-3.5">
            <Icon name="account_balance_wallet" size={28} className="text-lime" />
          </div>
          <h1 className="text-[22px] font-semibold text-ink">JodFlow</h1>
          <p className="text-label text-muted mt-1">ระบบบันทึกรายรับ-รายจ่าย</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-card border border-hairline shadow-card p-6"
        >
          <label className="block mb-4">
            <span className="block text-label font-medium text-ink mb-1.5">อีเมล</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              inputMode="email"
              className="w-full h-11 px-3.5 rounded-ctl border border-hairline text-body
                         focus:outline-none focus:border-ink"
              placeholder="you@example.com"
            />
          </label>

          <label className="block mb-5">
            <span className="block text-label font-medium text-ink mb-1.5">รหัสผ่าน</span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full h-11 pl-3.5 pr-11 rounded-ctl border border-hairline text-body
                           focus:outline-none focus:border-ink"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-1 top-1 w-9 h-9 rounded-ctl flex items-center justify-center
                           text-muted hover:bg-[#F6F5F1]"
                title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              >
                <Icon name={showPassword ? 'visibility_off' : 'visibility'} size={19} />
              </button>
            </div>
          </label>

          {error && (
            <div className="mb-4 px-3.5 py-2.5 rounded-ctl bg-expense-soft text-expense text-label flex gap-2">
              <Icon name="error" size={17} className="flex-none mt-px" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full h-11 rounded-ctl bg-ink text-white text-body font-semibold
                       hover:bg-[#24282F] disabled:opacity-55 disabled:cursor-not-allowed"
          >
            {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        {/* ระบบไม่ได้ต่อ SMTP จึงส่งลิงก์รีเซ็ตรหัสผ่านไม่ได้ — บอกทางออกจริงแทนปุ่มที่กดแล้วไม่เกิดอะไร */}
        <p className="text-center text-label text-muted mt-5 leading-relaxed">
          ลืมรหัสผ่าน หรือยังไม่มีบัญชี?<br />
          ติดต่อเจ้าของร้านให้ตั้งรหัสผ่านใหม่ให้
        </p>
      </div>
    </div>
  )
}
