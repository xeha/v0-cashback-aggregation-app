export type MobilePlatform = "ios" | "android" | "desktop"

export function getMobilePlatform(): MobilePlatform {
  if (typeof navigator === "undefined") return "desktop"
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return "ios"
  if (/Android/i.test(ua)) return "android"
  return "desktop"
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
