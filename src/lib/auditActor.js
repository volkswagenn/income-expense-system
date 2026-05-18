import useAuthStore from '../store/useAuthStore'

export function getCurrentActorSnapshot() {
  const user = useAuthStore.getState().currentUser
  if (!user) return null

  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role,
  }
}

export function getActorLabel(actor) {
  if (!actor) return 'ไม่ทราบผู้ทำรายการ'
  const name = actor.displayName || actor.username || actor.userId
  const username = actor.username && actor.username !== name ? `@${actor.username}` : ''
  return [name, username].filter(Boolean).join(' ')
}

export function getActorSearchText(actor) {
  if (!actor) return ''
  return [actor.displayName, actor.username, actor.userId, actor.role]
    .filter(Boolean)
    .join(' ')
}

export function stripActorFromLog(log) {
  if (!log || typeof log !== 'object') return log
  const hasActor = Boolean(log.actor)
  const rest = stripActorFields(log)
  return {
    ...rest,
    actorHidden: hasActor,
  }
}

function stripActorFields(value) {
  if (Array.isArray(value)) return value.map(stripActorFields)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'actor')
      .map(([key, item]) => [key, stripActorFields(item)])
  )
}
