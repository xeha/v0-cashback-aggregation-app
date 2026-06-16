/**
 * Node-side checks for pure image-utils helpers (no browser APIs).
 * Run: node scripts/verify-image-utils.mjs
 */

function isHeicFile(file) {
  const HEIC_TYPES = new Set(["image/heic", "image/heif"])
  const HEIC_EXTENSIONS = new Set(["heic", "heif"])
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  return HEIC_TYPES.has(file.type) || HEIC_EXTENSIONS.has(ext)
}

function makeFile(name, type) {
  return { name, type, size: 1024 }
}

let passed = 0
let failed = 0

function assert(label, condition) {
  if (condition) {
    passed += 1
    console.log(`  ✓ ${label}`)
    return
  }
  failed += 1
  console.error(`  ✗ ${label}`)
}

console.log("verify-image-utils")

assert("detects .heic extension", isHeicFile(makeFile("photo.heic", "")))
assert("detects image/heic mime", isHeicFile(makeFile("x", "image/heic")))
assert("detects .heif extension", isHeicFile(makeFile("photo.heif", "")))
assert("rejects jpeg", !isHeicFile(makeFile("photo.jpg", "image/jpeg")))

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
