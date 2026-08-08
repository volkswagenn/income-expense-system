import Icon from '../components/shared/Icon'
import { useAuth } from './AuthProvider'
import LoginPage from './LoginPage'

/** หน้าจอเต็มสำหรับสถานะที่ยังเข้าแอปไม่ได้ (โหลดอยู่ / พัง / ยังไม่มีร้าน) */
function FullScreen({ icon, tone = 'ink', title, detail, children }) {
  const toneClass = tone === 'error' ? 'bg-expense-soft text-expense' : 'bg-ink text-lime'
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-[400px] text-center">
        <div className={`w-14 h-14 rounded-panel flex items-center justify-center mx-auto mb-4 ${toneClass}`}>
          <Icon name={icon} size={28} />
        </div>
        <h1 className="text-[17px] font-semibold text-ink">{title}</h1>
        {detail && <p className="text-body text-muted mt-2 leading-relaxed">{detail}</p>}
        {children && <div className="mt-6 flex flex-col gap-2.5">{children}</div>}
      </div>
    </div>
  )
}

export default function AuthGate({ children }) {
  const { status, error, retry, signOut, user } = useAuth()

  // สถานะตอนติดตั้งครั้งแรก — ยังไม่ได้ใส่ค่า Supabase
  if (status === 'unconfigured') {
    return (
      <FullScreen icon="settings" tone="error" title="ยังตั้งค่าไม่เสร็จ">
        <div className="text-left text-body text-muted leading-relaxed space-y-3">
          <p>เปิดไฟล์ <code className="px-1.5 py-0.5 rounded bg-white border border-hairline text-ink">.env.local</code> ที่โฟลเดอร์โปรเจกต์ แล้วใส่ค่า 2 ตัวนี้:</p>
          <pre className="text-[12px] bg-white border border-hairline rounded-ctl p-3 overflow-x-auto text-ink">
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...`}
          </pre>
          <p>
            ค่าทั้งสองอยู่ที่ Supabase → <b className="text-ink">Settings → API</b>
            {' '}(ใช้ตัวที่เขียนว่า <b className="text-ink">anon public</b> เท่านั้น)
          </p>
          <p className="text-label">
            แก้แล้วต้องหยุด <code className="text-ink">npm run dev</code> แล้วสั่งใหม่ — Vite ไม่โหลดไฟล์ .env ซ้ำให้เอง
          </p>
        </div>
      </FullScreen>
    )
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center">
          <div className="w-9 h-9 mx-auto mb-3 rounded-full border-[3px] border-hairline border-t-ink animate-spin" />
          <p className="text-label text-muted">กำลังโหลด…</p>
        </div>
      </div>
    )
  }

  if (status === 'anon') return <LoginPage />

  if (status === 'error') {
    return (
      <FullScreen
        icon="cloud_off"
        tone="error"
        title="เชื่อมต่อระบบไม่ได้"
        detail={error ?? 'โหลดข้อมูลร้านไม่สำเร็จ'}
      >
        <button
          onClick={retry}
          className="h-11 rounded-ctl bg-ink text-white text-body font-semibold hover:bg-[#24282F]"
        >
          ลองใหม่
        </button>
        <button onClick={signOut} className="h-11 rounded-ctl border border-hairline text-body text-muted hover:bg-white">
          ออกจากระบบ
        </button>
      </FullScreen>
    )
  }

  if (status === 'no-shop') {
    return (
      <FullScreen
        icon="storefront"
        title="บัญชีนี้ยังไม่ได้ถูกเพิ่มเข้าร้าน"
        detail={`ล็อกอินสำเร็จแล้วในชื่อ ${user?.email ?? ''} แต่ยังไม่มีสิทธิ์เข้าถึงร้านไหนเลย ติดต่อเจ้าของร้านให้เพิ่มคุณเข้าร้านก่อน`}
      >
        <button
          onClick={retry}
          className="h-11 rounded-ctl bg-ink text-white text-body font-semibold hover:bg-[#24282F]"
        >
          ตรวจสอบอีกครั้ง
        </button>
        <button onClick={signOut} className="h-11 rounded-ctl border border-hairline text-body text-muted hover:bg-white">
          ออกจากระบบ
        </button>
      </FullScreen>
    )
  }

  return children
}
