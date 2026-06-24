import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT } = process.env

if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_ENDPOINT) {
  console.error("Missing R2 env vars")
  process.exit(1)
}

const SKIP_PATTERNS = [
  /^market_catalog_review_/,
  /^edadeal_categories_raw/,
  /^parsed_market_taxonomies/,
]

const CATALOG_DIRS = [
  join(root, "backend", "data"),
  join(root, "lib", "data"),
]

const client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})

let total = 0
for (const dir of CATALOG_DIRS) {
  const files = readdirSync(dir).filter(f => {
    if (!f.endsWith(".json")) return false
    if (SKIP_PATTERNS.some(p => p.test(f))) return false
    if (statSync(join(dir, f)).isDirectory()) return false
    return true
  })

  for (const file of files) {
    const body = readFileSync(join(dir, file))
    await client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: `catalogs/${file}`,
      Body: body,
      ContentType: "application/json",
      CacheControl: "public, max-age=300",
    }))
    console.log(`  ✓ catalogs/${file}`)
    total++
  }
}
console.log(`\nUploaded ${total} catalog files.`)
