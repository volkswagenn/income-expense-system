import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/useAuthStore'
import useRoleStore from '../../store/useRoleStore'
import { fetchAuthBootstrap } from '../../services/cloud/authSync'

const PIN_LENGTH = 6
const TAB_PW = 'pw'
const TAB_PIN = 'pin'

const KEYPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clear', '0', 'back'],
]

// ─── small helpers ───────────────────────────────────────────

function initials(name = '') {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-purple-500',
  'bg-orange-500', 'bg-rose-500', 'bg-teal-500',
]
function avatarColor(id) {
  const n = [...(id || '')].reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

// ─── sub-components ──────────────────────────────────────────

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-400 hover:text-gray-600'
      }`}
    >
      {children}
    </button>
  )
}

function PinDots({ value, shake }) {
  return (
    <div className={`flex gap-3 justify-center my-5 ${shake ? 'animate-shake' : ''}`}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <span
          key={i}
          className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-100 ${
            i < value.length
              ? 'bg-blue-600 border-blue-600 scale-110'
              : 'bg-white border-gray-300'
          }`}
        />
      ))}
    </div>
  )
}

function NumKey({ label, onPress }) {
  const isAction = label === 'back' || label === 'clear'
  return (
    <button
      onClick={() => onPress(label)}
      className={`
        flex items-center justify-center rounded-xl text-lg font-semibold
        h-14 w-full select-none transition-all duration-75 active:scale-95
        ${isAction
          ? 'bg-gray-100 text-gray-500 hover:bg-gray-200 text-sm'
          : 'bg-white text-gray-800 hover:bg-blue-50 shadow-sm border border-gray-200 hover:border-blue-200 hover:text-blue-700'}
      `}
    >
      {label === 'back' ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9l-3 3m0 0l3 3m-3-3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
        </svg>
      ) : label === 'clear' ? 'ล้าง' : label}
    </button>
  )
}

function BlockedPopup({ message, onClose }) {
  if (!message) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className="text-5xl mb-4">⛔</div>
        <h3 className="text-lg font-bold text-gray-900">บัญชีผู้ใช้ถูกบล็อก</h3>
        <p className="text-sm text-gray-500 mt-2">{message}</p>
        <button onClick={onClose} className="btn btn-primary w-full justify-center mt-6">
          รับทราบ
        </button>
      </div>
    </div>
  )
}

// ─── Password Tab ─────────────────────────────────────────────

function PasswordTab({ onSuccess, onBlocked }) {
  const loginByPassword = useAuthStore((s) => s.loginByPassword)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password) return
    setError('')
    setLoading(true)
    const result = await loginByPassword(username, password)
    if (result.success) onSuccess()
    else {
      setError(result.error)
      if (result.blocked) onBlocked(result.error)
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">ชื่อผู้ใช้</label>
        <input
          ref={inputRef}
          className="input"
          value={username}
          onChange={(e) => { setUsername(e.target.value); setError('') }}
          placeholder="กรอกชื่อผู้ใช้"
          autoComplete="username"
        />
      </div>
      <div>
        <label className="label">รหัสผ่าน</label>
        <div className="relative">
          <input
            className="input pr-10"
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            placeholder="กรอกรหัสผ่าน"
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            tabIndex={-1}
          >
            {showPw ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2 animate-fade-in">
          <span>⚠️</span> {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !username.trim() || !password}
        className="btn btn-primary w-full py-2.5 text-base justify-center disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
            </svg>
            กำลังเข้าสู่ระบบ...
          </span>
        ) : 'เข้าสู่ระบบ'}
      </button>
    </form>
  )
}

// ─── PIN Tab ──────────────────────────────────────────────────

function PinTab({ onSuccess, onBlocked }) {
  const loginByPinOnly   = useAuthStore((s) => s.loginByPinOnly)
  const pinLocked        = useAuthStore((s) => s.pinLocked)
  const pinFailCount     = useAuthStore((s) => s.pinFailCount)
  const maxPinAttempts   = useAuthStore((s) => s.maxPinLoginAttempts)
  const [pin, setPin]    = useState('')
  const [error, setError]   = useState('')
  const [shake, setShake]   = useState(false)
  const [loading, setLoading] = useState(false)

  const triggerShake = useCallback(() => {
    setShake(true)
    setTimeout(() => setShake(false), 600)
  }, [])

  const handleKey = useCallback((key) => {
    if (pinLocked) return
    setError('')
    if (key === 'back') setPin((p) => p.slice(0, -1))
    else if (key === 'clear') setPin('')
    else if (pin.length < PIN_LENGTH) setPin((p) => p + key)
  }, [pin, pinLocked])

  useEffect(() => {
    const onKey = (e) => {
      if (pinLocked) return
      if (e.key >= '0' && e.key <= '9') handleKey(e.key)
      else if (e.key === 'Backspace') handleKey('back')
      else if (e.key === 'Escape') handleKey('clear')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleKey, pinLocked])

  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      handlePinSubmit(pin)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin])

  const handlePinSubmit = async (value) => {
    if (loading || pinLocked) return
    setLoading(true)
    setPin('')
    const result = await loginByPinOnly(value)
    if (result.success) {
      onSuccess()
    } else {
      setError(result.error)
      if (result.blocked) onBlocked(result.error)
      triggerShake()
    }
    setLoading(false)
  }

  // ── PIN Locked state ─────────────────────────────────────────
  if (pinLocked) {
    return (
      <div className="text-center py-6">
        <div className="text-4xl mb-3">🔒</div>
        <p className="text-sm font-semibold text-red-600">PIN ถูกล็อคชั่วคราว</p>
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
          กรอก PIN ผิดเกินจำนวนที่กำหนด<br />
          กรุณาเข้าสู่ระบบด้วยชื่อผู้ใช้/รหัสผ่านเพื่อปลดล็อค
        </p>
      </div>
    )
  }

  // ── PIN Pad ───────────────────────────────────────────────────
  return (
    <div>
      <p className="text-sm text-center text-gray-500">กรอกรหัส PIN 6 หลัก</p>
      {pinFailCount > 0 && (
        <p className="text-center text-amber-500 text-xs mt-1 animate-fade-in">
          ⚠️ กรอกผิดแล้ว {pinFailCount}/{maxPinAttempts} ครั้ง
        </p>
      )}
      <PinDots value={pin} shake={shake} />

      {error && (
        <p className="text-center text-red-500 text-xs mb-3 animate-fade-in">⚠️ {error}</p>
      )}

      <div className="grid gap-2.5">
        {KEYPAD.map((row, ri) => (
          <div key={ri} className="grid grid-cols-3 gap-2.5">
            {row.map((key) => (
              <NumKey key={key} label={key} onPress={handleKey} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────


export default function LoginPage() {
  const navigate = useNavigate()
  const { users, initUsers, isAuthenticated } = useAuthStore((s) => s)
  const initRoles = useRoleStore((s) => s.initRoles)
  const [tab, setTab] = useState(TAB_PW)
  const [initing, setIniting] = useState(true)
  const [initMsg, setInitMsg] = useState('กำลังโหลดระบบ...')
  const [blockedPopup, setBlockedPopup] = useState('')

  useEffect(() => {
    initRoles()
    const bootstrap = async () => {
      setIniting(true)
      setInitMsg('กำลังดึงข้อมูลผู้ใช้จาก cloud...')
      const result = await fetchAuthBootstrap()
      // ถ้า cloud ได้ข้อมูลมา ไม่ต้องสร้าง default
      if (useAuthStore.getState().users.length === 0) {
        setInitMsg('ไม่พบข้อมูลบน cloud — โหลดค่าเริ่มต้น...')
        await initUsers()
      } else if (result.ok) {
        setInitMsg(`พร้อมใช้งาน — พบ ${result.users} บัญชีจาก cloud`)
      }
      // หน่วง 600ms ให้ user เห็นข้อความก่อนหาย
      await new Promise((r) => setTimeout(r, 600))
      setIniting(false)
    }
    bootstrap()
  }, [])

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  const usersWithPin = users.filter((u) => u.pinHash)

  const handleSuccess = () => navigate('/', { replace: true })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex">

      {/* ── Left branding panel (desktop) ── */}
      <div className="hidden lg:flex w-[420px] xl:w-[480px] flex-shrink-0 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-12 text-white">
          <div className="text-8xl mb-6 drop-shadow-lg">🐾</div>
          <h1 className="text-3xl font-bold text-center leading-snug">
            บันทึกรายรับ-รายจ่าย<br />ร้านค้า
          </h1>
          <p className="text-blue-200 mt-2 text-sm">Multi-Shop Edition</p>

          <div className="mt-12 w-full max-w-xs space-y-3">
            {[
              ['📊', 'จัดการหลายร้านในที่เดียว'],
              ['💰', 'บันทึกรายรับ-รายจ่ายง่าย'],
              ['📈', 'รายงานสรุปครบถ้วน'],
              ['☁️', 'รองรับ Cloud Sync หลายเครื่อง'],
            ].map(([icon, text]) => (
              <div key={text} className="flex items-center gap-3 text-blue-100 text-sm bg-white/10 rounded-xl px-4 py-2.5">
                <span className="text-base">{icon}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="px-12 py-6 border-t border-white/10 text-center">
          <p className="text-blue-300 text-xs">ข้อมูลเก็บในเครื่อง · รองรับ Cloud Sync ผ่าน Supabase</p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">

          {/* Mobile branding */}
          <div className="lg:hidden text-center mb-8">
            <div className="text-5xl mb-2">🐾</div>
            <h1 className="text-2xl font-bold text-gray-900">บันทึกรายรับ-รายจ่าย</h1>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-100">

            {/* Header */}
            <div className="px-7 pt-7 pb-0">
              <h2 className="text-xl font-bold text-gray-900">เข้าสู่ระบบ</h2>
              <p className="text-gray-400 text-sm mt-1">เลือกวิธีเข้าสู่ระบบด้านล่าง</p>
            </div>

            {/* Tabs */}
            <div className="flex px-7 mt-5 border-b border-gray-100">
              <TabBtn active={tab === TAB_PW} onClick={() => setTab(TAB_PW)}>
                👤 ชื่อผู้ใช้ / รหัสผ่าน
              </TabBtn>
              <TabBtn active={tab === TAB_PIN} onClick={() => setTab(TAB_PIN)}>
                🔢 รหัส PIN
              </TabBtn>
            </div>

            {/* Tab content */}
            <div className="px-7 py-6">
              {initing ? (
                <div className="flex flex-col items-center gap-3 py-8 text-gray-400">
                  <svg className="w-6 h-6 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                  </svg>
                  <p className="text-sm text-center leading-relaxed">{initMsg}</p>
                </div>
              ) : tab === TAB_PW ? (
                <PasswordTab onSuccess={handleSuccess} onBlocked={setBlockedPopup} />
              ) : usersWithPin.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-3xl mb-3">🔢</p>
                  <p className="text-sm">ยังไม่มีผู้ใช้ที่ตั้งรหัส PIN</p>
                  <p className="text-xs mt-1">ใช้วิธีชื่อผู้ใช้/รหัสผ่านก่อน แล้วตั้ง PIN ในการจัดการผู้ใช้</p>
                </div>
              ) : (
                <PinTab onSuccess={handleSuccess} onBlocked={setBlockedPopup} />
              )}
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 mt-5">
            บันทึกรายรับ-รายจ่ายร้านค้า · Multi-Shop Edition
          </p>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}15%{transform:translateX(-8px)}
          30%{transform:translateX(8px)}45%{transform:translateX(-6px)}
          60%{transform:translateX(6px)}75%{transform:translateX(-3px)}90%{transform:translateX(3px)}
        }
        .animate-shake{animation:shake .5s ease-in-out}
        @keyframes fade-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        .animate-fade-in{animation:fade-in .2s ease-out}
      `}</style>
      <BlockedPopup message={blockedPopup} onClose={() => setBlockedPopup('')} />
    </div>
  )
}
