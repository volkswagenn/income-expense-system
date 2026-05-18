import { Navigate } from 'react-router-dom'
import useAuthStore from '../../store/useAuthStore'
import useRoleStore from '../../store/useRoleStore'
import { checkPermission } from '../../lib/permissions'

export default function PermissionGuard({ permission, children, fallback = '/' }) {
  const role = useAuthStore((s) => s.currentUser?.role)
  const roles = useRoleStore((s) => s.roles)

  if (!checkPermission(roles, role, permission)) {
    return <Navigate to={fallback} replace />
  }

  return children
}
