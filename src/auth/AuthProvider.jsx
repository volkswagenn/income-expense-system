import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { setShopId } from '../lib/api/context'
import { configError, supabase, toThaiError } from '../lib/supabase'
import { resetStores } from '../store/hydrate'

/**
 * ศูนย์กลางของ "ตอนนี้ใครล็อกอินอยู่ และอยู่ร้านไหน สิทธิ์อะไร"
 *
 * status:
 *   'unconfigured' — ยังไม่ได้ใส่ค่า Supabase ใน .env.local (สถานะตอนติดตั้งครั้งแรก)
 *   'loading'  — ยังตอบไม่ได้ (กำลังอ่าน session หรือกำลังโหลดร้าน)
 *   'anon'     — ยังไม่ได้ล็อกอิน → แสดงหน้า login
 *   'no-shop'  — ล็อกอินแล้วแต่ยังไม่ถูกเพิ่มเข้าร้านไหนเลย → ต้องให้ owner เพิ่มให้
 *   'error'    — โหลดข้อมูลร้านไม่สำเร็จ (เน็ตหลุด/DB ล่ม) → มีปุ่มลองใหม่
 *   'ready'    — ใช้งานได้
 */
const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth ต้องอยู่ภายใต้ <AuthProvider>')
  return ctx
}

/** โหลด profile + ร้าน + role ของผู้ใช้คนนี้พร้อมกัน */
async function loadContext(userId) {
  const [profileRes, memberRes] = await Promise.all([
    supabase.from('profiles').select('id, email, display_name').eq('id', userId).maybeSingle(),
    supabase
      .from('shop_members')
      .select('role, shop:shops!inner(id, name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1),
  ])

  if (profileRes.error) throw new Error(toThaiError(profileRes.error))
  if (memberRes.error) throw new Error(toThaiError(memberRes.error))

  const membership = memberRes.data?.[0] ?? null
  return {
    profile: profileRes.data,
    shop: membership?.shop ?? null,
    role: membership?.role ?? null,
  }
}

export function AuthProvider({ children }) {
  // undefined = ยังไม่รู้ว่ามี session ไหม, null = ไม่มี
  const [session, setSession] = useState(undefined)
  const [state, setState] = useState({ status: 'loading', profile: null, shop: null, role: null, error: null })
  const [reloadKey, setReloadKey] = useState(0)

  // ── ติดตาม session ────────────────────────────────────────────────────────
  useEffect(() => {
    if (configError) return // ยังไม่ได้ตั้งค่า — อย่าเพิ่งยิงไปที่ไหน
    let alive = true

    supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session ?? null)
    })

    // หมายเหตุ: ห้าม await supabase ตัวอื่นใน callback นี้ (supabase-js จะค้าง)
    // จึงแค่เก็บ session ไว้ แล้วให้ effect ข้างล่างเป็นคนโหลดข้อมูลต่อ
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (alive) setSession(s ?? null)
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // ── พอรู้ว่าเป็นใคร ค่อยโหลดร้าน + สิทธิ์ ───────────────────────────────────
  const userId = session?.user?.id ?? null

  useEffect(() => {
    if (configError) {
      setState({ status: 'unconfigured', profile: null, shop: null, role: null, error: configError })
      return
    }
    if (session === undefined) return // ยังอ่าน session ไม่เสร็จ

    if (!userId) {
      setShopId(null)
      setState({ status: 'anon', profile: null, shop: null, role: null, error: null })
      return
    }

    let alive = true
    setState((s) => ({ ...s, status: 'loading', error: null }))

    loadContext(userId)
      .then(({ profile, shop, role }) => {
        if (!alive) return
        if (!shop) {
          setShopId(null)
          setState({ status: 'no-shop', profile, shop: null, role: null, error: null })
          return
        }
        // ต้องตั้งก่อน render แอป เพราะทุก api/* อ่าน shopId จากตรงนี้
        setShopId(shop.id)
        setState({ status: 'ready', profile, shop, role, error: null })
      })
      .catch((err) => {
        if (alive) setState({ status: 'error', profile: null, shop: null, role: null, error: err.message })
      })

    return () => {
      alive = false
    }
  }, [userId, session === undefined, reloadKey])

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) throw new Error(toThaiError(error))
  }, [])

  const signOut = useCallback(async () => {
    // ล้าง store ก่อนตัด session — ไม่งั้นข้อมูลร้านเดิมยังค้างอยู่ในหน่วยความจำ
    // แล้วโผล่ให้คนที่ล็อกอินต่อจากนี้เห็นชั่วขณะก่อน hydrate รอบใหม่จะเสร็จ
    resetStores()
    setShopId(null)
    await supabase.auth.signOut()
  }, [])

  const changePassword = useCallback(async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw new Error(toThaiError(error))
  }, [])

  const retry = useCallback(() => setReloadKey((k) => k + 1), [])

  const value = {
    ...state,
    session,
    user: session?.user ?? null,
    shopId: state.shop?.id ?? null,
    canEdit: state.role === 'owner' || state.role === 'editor',
    isOwner: state.role === 'owner',
    signIn,
    signOut,
    changePassword,
    retry,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
