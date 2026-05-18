import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import useAuthStore from '../../store/useAuthStore'
import useRoleStore from '../../store/useRoleStore'

export default function AuthGuard() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const initUsers = useAuthStore((s) => s.initUsers)
  const initRoles = useRoleStore((s) => s.initRoles)

  useEffect(() => {
    initRoles()
    initUsers()
  }, [])

  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Outlet />
}
