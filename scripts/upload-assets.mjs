import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { readFileSync, readdirSync } from "node:fs"
import { join, extname } from "node:path"

const args = process.argv.slice(2)
const logosDir = args[args.indexOf("--logos-dir") + 1] ?? null

const {
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_ENDPOINT,
  LOGOS_BANKS_DIR,
  LOGOS_MARKETS_DIR,
} = process.env

if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_ENDPOINT) {
  console.error("Missing R2 env vars: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT")
  process.exit(1)
}

const client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})

async function uploadDir(localDir, r2Prefix) {
  const files = readdirSync(localDir).filter(f => extname(f) === ".png")
  console.log(`Uploading ${files.length} files from ${localDir} → ${r2Prefix}/`)
  for (const file of files) {
    const body = readFileSync(join(localDir, file))
    await client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: `${r2Prefix}/${file}`,
      Body: body,
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000, immutable",
    }))
    process.stdout.write(".")
  }
  console.log(`\nDone: ${files.length} files uploaded to ${r2Prefix}/`)
}

if (logosDir) {
  await uploadDir(logosDir, "logos/banks")
} else {
  if (!LOGOS_BANKS_DIR || !LOGOS_MARKETS_DIR) {
    console.error("Provide --logos-dir OR set LOGOS_BANKS_DIR and LOGOS_MARKETS_DIR env vars")
    process.exit(1)
  }
  await uploadDir(LOGOS_BANKS_DIR, "logos/banks")
  await uploadDir(LOGOS_MARKETS_DIR, "logos/markets")
}
