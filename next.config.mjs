/** @type {import('next').NextConfig} */
const allowedDevOrigins = ["localhost", "127.0.0.1"]
if (process.env.DEV_LAN_HOST) {
  allowedDevOrigins.push(process.env.DEV_LAN_HOST)
}

const nextConfig = {
  allowedDevOrigins,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
