/** @type {import('next').NextConfig} */
const allowedDevOrigins = ["localhost", "127.0.0.1"]
if (process.env.DEV_LAN_HOST) {
  allowedDevOrigins.push(process.env.DEV_LAN_HOST)
}

/** Backend target for dev proxy — always loopback (Next.js and uvicorn run on the same Mac). */
const devProxyBackendUrl = "http://127.0.0.1:8000"

const nextConfig = {
  allowedDevOrigins,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return []
    return [
      {
        source: "/api/ocr/:path*",
        destination: `${devProxyBackendUrl}/api/ocr/:path*`,
      },
      {
        source: "/api/category/:path*",
        destination: `${devProxyBackendUrl}/api/category/:path*`,
      },
    ]
  },
}

export default nextConfig
