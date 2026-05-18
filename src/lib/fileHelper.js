/**
 * Save a generated file (reports, templates).
 * Electron: opens a Save dialog so the user chooses the location.
 * Browser dev: triggers a standard browser download.
 *
 * Returns { success, savedPath, verified, cancelled? }
 */
export async function saveAppFile(data, folder, filename) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)

  if (window.electronAPI?.downloadFile) {
    return window.electronAPI.downloadFile(bytes, folder, filename)
  }

  // Browser dev fallback
  const blob = new Blob([bytes])
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return { success: true, savedPath: filename, verified: true }
}
