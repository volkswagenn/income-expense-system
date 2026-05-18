/**
 * Reads the version from public/SettingApp.txt and writes it into package.json
 * before electron-builder runs, so the installer filename matches SettingApp.
 *
 * SettingApp.txt format:
 *   File Version = X.Y.Z
 *   Name Shop = ...
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SETTING_PATH = path.join(ROOT, 'public', 'SettingApp.txt')
const PKG_PATH = path.join(ROOT, 'package.json')

const settingText = fs.readFileSync(SETTING_PATH, 'utf8')
const match = settingText.match(/File Version\s*=\s*([\d.]+)/)

if (!match) {
  console.error('❌ ไม่พบ "File Version = X.Y.Z" ใน SettingApp.txt')
  process.exit(1)
}

const version = match[1].trim()
const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'))

if (pkg.version === version) {
  console.log(`✓ version ตรงกันแล้ว (${version}) — ไม่มีการเปลี่ยนแปลง`)
  process.exit(0)
}

const oldVersion = pkg.version
pkg.version = version
fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n')
console.log(`✓ sync version: ${oldVersion} → ${version}`)
