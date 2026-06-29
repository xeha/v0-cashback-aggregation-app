import { useEffect, useState } from "react"

export const PROVIDER_LOGO_PLACEHOLDER = "/placeholder.svg"

const PLACEHOLDER_PALETTE = [
  { bg: "#FDE68A", text: "#92400E" },
  { bg: "#BFDBFE", text: "#1E40AF" },
  { bg: "#BBF7D0", text: "#166534" },
  { bg: "#FBCFE8", text: "#9D174D" },
  { bg: "#DDD6FE", text: "#5B21B6" },
  { bg: "#FECACA", text: "#991B1B" },
  { bg: "#A5F3FC", text: "#155E75" },
  { bg: "#FED7AA", text: "#9A3412" },
  { bg: "#D9F99D", text: "#3F6212" },
  { bg: "#E9D5FF", text: "#6B21A8" },
] as const

export function isPlaceholderProviderLogo(logo: string | undefined | null): boolean {
  return !logo || logo === PROVIDER_LOGO_PLACEHOLDER
}

export function getProviderInitial(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return "?"

  const first = [...trimmed][0]
  return first ? first.toUpperCase() : "?"
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

export function getPlaceholderAvatarColors(seed: string) {
  const palette = PLACEHOLDER_PALETTE[hashString(seed.trim().toLowerCase()) % PLACEHOLDER_PALETTE.length]
  return { backgroundColor: palette.bg, color: palette.text }
}

export function ProviderLogo({
  name,
  logo,
  seed,
  className = "h-7 w-7 text-[12px]",
}: {
  name: string
  logo?: string
  /** Stable id for color when several placeholders share the same initial */
  seed?: string
  className?: string
}) {
  const hasLogo = !isPlaceholderProviderLogo(logo)
  const [src, setSrc] = useState(hasLogo ? logo! : PROVIDER_LOGO_PLACEHOLDER)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!hasLogo) return
    setSrc(logo!)
    setLoaded(false)
    setFailed(false)
  }, [hasLogo, logo])

  const colors = getPlaceholderAvatarColors(seed ?? name)

  if (!hasLogo || failed) {
    return (
      <span
        title={name}
        aria-label={name}
        style={colors}
        className={`inline-flex shrink-0 items-center justify-center rounded-lg font-bold ${className}`}
      >
        {getProviderInitial(name)}
      </span>
    )
  }

  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      {!loaded && (
        <span
          title={name}
          aria-hidden
          style={colors}
          className="absolute inset-0 inline-flex items-center justify-center rounded-lg text-[12px] font-bold"
        >
          {getProviderInitial(name)}
        </span>
      )}
      <img
        src={src}
        alt={name}
        title={name}
        loading="eager"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          setFailed(true)
        }}
        className={`h-full w-full rounded-lg object-cover transition-opacity duration-150 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </span>
  )
}
