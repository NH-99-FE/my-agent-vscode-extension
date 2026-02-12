import fs from 'node:fs'
import path from 'node:path'

const from = path.resolve('webview-ui/dist')
const to = path.resolve('media')

fs.rmSync(to, { recursive: true, force: true })
fs.mkdirSync(to, { recursive: true })
fs.cpSync(from, to, { recursive: true })

console.log(`[copy] ${from} -> ${to}`)
