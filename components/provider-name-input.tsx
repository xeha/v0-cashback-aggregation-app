"use client"

import { useEffect, useId, useRef, useState } from "react"
import {
  searchAllProviderSuggestions,
  type ProviderSuggestion,
} from "@/lib/provider-logos"
import type { Kind } from "@/lib/types"

export function ProviderNameInput({
  value,
  catalogSlug,
  catalogKind,
  placeholder,
  autoFocus,
  disabled = false,
  onChange,
}: {
  value: string
  catalogSlug: string | null
  catalogKind: Kind | null
  placeholder: string
  autoFocus?: boolean
  disabled?: boolean
  onChange: (name: string, catalogSlug: string | null, kind: Kind | null) => void
}) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const suggestions =
    value.trim().length > 0 ? searchAllProviderSuggestions(value) : []

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [])

  function handleInputChange(nextValue: string) {
    onChange(nextValue, null, null)
    setIsOpen(true)
  }

  function handleSelect(suggestion: ProviderSuggestion) {
    onChange(suggestion.name, suggestion.slug, suggestion.kind)
    setIsOpen(false)
  }

  const showSuggestions = isOpen && suggestions.length > 0

  return (
    <div ref={rootRef} className="relative w-full">
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        disabled={disabled}
        readOnly={disabled}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => {
          if (!disabled) setIsOpen(true)
        }}
        placeholder={placeholder}
        aria-expanded={showSuggestions}
        aria-controls={showSuggestions ? listId : undefined}
        aria-autocomplete="list"
        className={`w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-[15px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white ${
          disabled ? "cursor-default opacity-70" : ""
        }`}
      />

      {showSuggestions && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-52 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {suggestions.map((suggestion) => {
            const isActive =
              catalogSlug === suggestion.slug && catalogKind === suggestion.kind
            return (
              <li
                key={`${suggestion.kind}:${suggestion.slug}`}
                role="option"
                aria-selected={isActive}
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(suggestion)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 ${
                    isActive ? "bg-emerald-50" : ""
                  }`}
                >
                  <img
                    src={suggestion.logo}
                    alt=""
                    className="h-7 w-7 shrink-0 rounded-lg object-cover"
                  />
                  <span className="truncate text-[14px] font-medium text-slate-800">
                    {suggestion.name}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
