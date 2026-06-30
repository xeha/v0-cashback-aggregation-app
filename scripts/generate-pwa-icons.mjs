import { mkdirSync, readFileSync } from "node:fs"
import sharp from "sharp"

const svg = readFileSync("public/images/logo-icon.svg")
const outDir = "public/images/pwa"
mkdirSync(outDir, { recursive: true })

const sizes = [180, 192, 512]

for (const size of sizes) {
  await sharp(svg).resize(size, size).png().toFile(`${outDir}/icon-${size}.png`)
}

const maskableSize = 512
const innerSize = Math.round(maskableSize * 0.8)
const inner = await sharp(svg).resize(innerSize, innerSize).png().toBuffer()
const offset = Math.round((maskableSize - innerSize) / 2)

await sharp({
  create: {
    width: maskableSize,
    height: maskableSize,
    channels: 4,
    background: "#FEF08A",
  },
})
  .composite([{ input: inner, left: offset, top: offset }])
  .png()
  .toFile(`${outDir}/icon-maskable-512.png`)

console.log(`PWA icons written to ${outDir}/`)
