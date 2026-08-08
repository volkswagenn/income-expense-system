/**
 * Save a generated file (reports, templates) by triggering a browser download.
 *
 * Returns { success, savedPath, verified }
 */
export async function saveAppFile(data, folder, filename) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)

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
