"use client"

type AppLogoProps = {
  size?: "sm" | "md" | "lg"
  showName?: boolean
  className?: string
  variant?: "icon" | "illustration"
}

const SIZE_CLASS = { sm: "h-8 w-8", md: "h-11 w-11", lg: "h-14 w-14" } as const
const ROUND_CLASS = { sm: "rounded-lg", md: "rounded-xl", lg: "rounded-2xl" } as const

export function AppLogo({
  size = "md",
  showName = false,
  className = "",
  variant = "icon",
}: AppLogoProps) {
  const mark =
    variant === "illustration" ? (
      <div
        className={`${SIZE_CLASS[size]} ${ROUND_CLASS[size]} shrink-0 overflow-hidden bg-yellow-50`}
      >
        <img
          src="/images/empty-cashback.png"
          alt=""
          aria-hidden
          className="h-full w-full scale-[1.4] object-cover object-[50%_38%]"
        />
      </div>
    ) : (
      <img
        src="/images/logo-icon.svg"
        alt=""
        className={`${SIZE_CLASS[size]} ${ROUND_CLASS[size]} shrink-0 object-contain`}
        aria-hidden
      />
    )

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {mark}
      {showName && (
        <span className="text-[15px] font-bold text-slate-900">CashbackBrain</span>
      )}
    </div>
  )
}
