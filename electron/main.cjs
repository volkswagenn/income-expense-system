const { app, BrowserWindow, shell, Menu, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

const isDev = !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'บันทึกรายรับ-รายจ่าย',
    show: false,
    backgroundColor: '#f9fafb',
  })

  // เมนูแค่ที่จำเป็น
  const menu = Menu.buildFromTemplate([
    {
      label: 'แอป',
      submenu: [
        { label: 'รีโหลด', accelerator: 'F5', role: 'reload' },
        { type: 'separator' },
        { label: 'ออกจากโปรแกรม', accelerator: 'Alt+F4', role: 'quit' },
      ],
    },
    {
      label: 'แก้ไข',
      submenu: [
        { role: 'undo', label: 'เลิกทำ' },
        { role: 'redo', label: 'ทำซ้ำ' },
        { type: 'separator' },
        { role: 'cut', label: 'ตัด' },
        { role: 'copy', label: 'คัดลอก' },
        { role: 'paste', label: 'วาง' },
      ],
    },
    ...(isDev
      ? [{ label: 'Dev', submenu: [{ label: 'DevTools', accelerator: 'F12', role: 'toggleDevTools' }] }]
      : []),
  ])
  Menu.setApplicationMenu(menu)

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  win.once('ready-to-show', () => win.show())

  // ลิงก์ภายนอกเปิดใน browser แทน
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

// Save an uploaded file next to the app exe (portable — travels with the app folder)
// Dev: project root / Prod: directory containing the .exe
const APP_DATA_ROOT = isDev
  ? path.join(__dirname, '..')
  : path.dirname(app.getPath('exe'))

const DEFAULT_FOLDERS = ['shops']

function resolveAppPath(relativePath = '') {
  const root = path.resolve(APP_DATA_ROOT)
  const target = path.isAbsolute(relativePath)
    ? path.resolve(relativePath)
    : path.resolve(root, relativePath)
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('Invalid app folder path')
  }
  return target
}

function mimeFromExt(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  if (['jpg', 'jpeg'].includes(ext)) return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'bmp') return 'image/bmp'
  if (ext === 'pdf') return 'application/pdf'
  return 'application/octet-stream'
}

function ensureDefaultFolders() {
  DEFAULT_FOLDERS.forEach((folder) => {
    fs.mkdirSync(path.join(APP_DATA_ROOT, folder), { recursive: true })
  })
}

ipcMain.handle('get-app-root', () => APP_DATA_ROOT)

ipcMain.handle('open-folder', async (_event, folderName) => {
  try {
    const folderPath = resolveAppPath(folderName)
    fs.mkdirSync(folderPath, { recursive: true })
    await shell.openPath(folderPath)
    return { success: true, folderPath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('open-path', async (_event, targetPath) => {
  try {
    const resolved = resolveAppPath(targetPath)
    const error = await shell.openPath(resolved)
    return error ? { success: false, error } : { success: true, path: resolved }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('open-containing-folder', async (_event, targetPath) => {
  try {
    const resolved = resolveAppPath(targetPath)
    const folderPath = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()
      ? resolved
      : path.dirname(resolved)
    fs.mkdirSync(folderPath, { recursive: true })
    await shell.openPath(folderPath)
    return { success: true, folderPath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('read-file-data-url', async (_event, targetPath) => {
  try {
    const resolved = resolveAppPath(targetPath)
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return { success: false, error: 'ไม่พบไฟล์เอกสารแนบ' }
    }
    const data = fs.readFileSync(resolved)
    return {
      success: true,
      dataUrl: `data:${mimeFromExt(resolved)};base64,${data.toString('base64')}`,
      mimeType: mimeFromExt(resolved),
      fileName: path.basename(resolved),
      path: resolved,
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('save-file', async (_event, { data, filePath }) => {
  try {
    const dest = resolveAppPath(filePath)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, Buffer.from(data))
    const verified = fs.existsSync(dest)
    return { success: verified, savedPath: dest, verified }
  } catch (err) {
    return { success: false, error: err.message, verified: false }
  }
})

// Download a generated file — opens Save dialog so user chooses location
ipcMain.handle('download-file', async (_event, { data, folder, filename }) => {
  try {
    const ext = path.extname(filename).slice(1).toLowerCase()
    const filters =
      ext === 'xlsx' ? [{ name: 'Excel Workbook', extensions: ['xlsx'] }] :
      ext === 'csv'  ? [{ name: 'CSV', extensions: ['csv'] }] :
                       [{ name: 'All Files', extensions: ['*'] }]

    const defaultPath = path.join(app.getPath('documents'), folder, filename)
    const result = await dialog.showSaveDialog({ defaultPath, filters })

    if (result.canceled) return { success: false, cancelled: true }

    const dest = result.filePath
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, Buffer.from(data))
    const verified = fs.existsSync(dest)
    return { success: verified, savedPath: dest, verified }
  } catch (err) {
    return { success: false, error: err.message, verified: false }
  }
})

app.whenReady().then(() => {
  ensureDefaultFolders()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
