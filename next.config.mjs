import os from "node:os"

function getAllowedDevOrigins() {
  const origins = new Set(["localhost", "127.0.0.1"])
  if (process.env.DEV_LAN_HOST) {
    origins.add(process.env.DEV_LAN_HOST)
  }
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const iface of interfaces ?? []) {
      const isIpv4 = iface.family === "IPv4" || iface.family === 4
      if (isIpv4 && !iface.internal) {
        origins.add(iface.address)
      }
    }
  }
  return [...origins]
}

/** @type {import('next').NextConfig} */
const allowedDevOrigins = getAllowedDevOrigins()

/** Backend target for dev proxy — always loopback (Next.js and uvicorn run on the same Mac). */
const devProxyBackendUrl = "http://127.0.0.1:8000"

const nextConfig = {
  output: "standalone",
  allowedDevOrigins,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.dev",
      },
      {
        protocol: "https",
        hostname: "**.s3.twcstorage.ru",
      },
      {
        protocol: "https",
        hostname: "**.cdn.twcstorage.ru",
      },
    ],
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
      {
        source: "/api/auth/:path*",
        destination: `${devProxyBackendUrl}/api/auth/:path*`,
      },
      {
        source: "/api/pipeline/:path*",
        destination: `${devProxyBackendUrl}/api/pipeline/:path*`,
      },
    ]
  },
}

export default nextConfig
