"use client"

type AppLogoProps = {
  size?: "sm" | "md" | "lg"
  showName?: boolean
  className?: string
}

const SIZE_CLASS = { sm: "h-8 w-8", md: "h-11 w-11", lg: "h-14 w-14" } as const

export function AppLogo({ size = "md", showName = false, className = "" }: AppLogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src="/images/logo-icon.svg"
        alt=""
        className={`${SIZE_CLASS[size]} shrink-0 rounded-xl object-contain`}
        aria-hidden
      />
      {showName && (
        <span className="text-[15px] font-bold text-slate-900">CashbackBrain</span>
      )}
    </div>
  )
}
