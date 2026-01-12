/**
 * Generate platform-specific icons from SVG
 * Run with: node scripts/generate-icons.mjs
 */

import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { writeFile, readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const assetsDir = join(__dirname, '..', 'assets')

async function generateIcons() {
  console.log('Generating platform icons...')

  const svgPath = join(assetsDir, 'icon.svg')
  const svgBuffer = await readFile(svgPath)

  // Generate PNG at 512x512 for Linux
  console.log('Creating icon.png (512x512)...')
  const pngBuffer = await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toBuffer()
  await writeFile(join(assetsDir, 'icon.png'), pngBuffer)

  // Generate ICO for Windows (multi-size)
  console.log('Creating icon.ico...')
  const sizes = [16, 32, 48, 64, 128, 256]
  const pngBuffers = await Promise.all(
    sizes.map(size =>
      sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toBuffer()
    )
  )
  const icoBuffer = await pngToIco(pngBuffers)
  await writeFile(join(assetsDir, 'icon.ico'), icoBuffer)

  console.log('Done! Icons created:')
  console.log('  - assets/icon.png (Linux)')
  console.log('  - assets/icon.ico (Windows)')
  console.log('')
  console.log('Note: For macOS icon.icns, use an online converter or macOS tools:')
  console.log('  - https://cloudconvert.com/png-to-icns')
  console.log('  - Or on macOS: iconutil -c icns icon.iconset')
}

generateIcons().catch(console.error)
