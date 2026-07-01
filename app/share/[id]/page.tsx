import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { formatCashbackPeriod } from "@/lib/cashback-period"
import {
  groupMatrixRows,
  groupHasSubcategories,
  getVisibleBankGroupRows,
  getVisibleMarketGroupRows,
  getMarketGroupDisplayLabel,
  resolveMarketRowCategory,
  countProvidersInGroup,
} from "@/lib/matrix"
import { formatCategoryLabel } from "@/lib/category-label"
import type { CashbackMatrix, Kind, MatrixGroup, MatrixProvider } from "@/lib/types"

const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL

type PbRecord = {
  id: string
  title: string
  period_month?: number
  period_year?: number
  bank_matrix?: CashbackMatrix | null
  market_matrix?: CashbackMatrix | null
}

async function fetchRecord(id: string): Promise<PbRecord | null> {
  if (!PB_URL) return null
  try {
    const res = await fetch(`${PB_URL}/api/collections/saved_matrices/records/${id}`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    return res.json() as Promise<PbRecord>
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ kind?: string }>
}): Promise<Metadata> {
  const { id } = await params
  const { kind } = await searchParams
  const record = await fetchRecord(id)
  if (!record) return { title: "Кешбэки — CashbackBrain" }
  const period =
    record.period_month && record.period_year
      ? formatCashbackPeriod({ month: record.period_month, year: record.period_year })
      : record.title
  const kindLabel = kind === "bank" ? " — Банки" : kind === "market" ? " — Маркетплейсы" : ""
  return {
    title: `Кешбэки за ${period}${kindLabel} — CashbackBrain`,
    description: "Сравнение кешбэка по картам и маркетплейсам",
  }
}

/* ------------------------------------------------------------------ */
/* Rate badge                                                          */
/* ------------------------------------------------------------------ */

function RateBadge({ rate }: { rate: number }) {
  const cls =
    rate >= 5
      ? "bg-green-100 text-green-700"
      : rate >= 3
        ? "bg-yellow-100 text-yellow-700"
        : "bg-red-100 text-red-700"
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[12px] font-semibold ${cls}`}>
      {rate}%
    </span>
  )
}

function RateCells({
  rates,
  providers,
}: {
  rates: Record<string, number>
  providers: MatrixProvider[]
}) {
  return (
    <>
      {providers.map((p) => {
        const rate = rates[p.key]
        return (
          <td key={p.key} className="px-2 py-2 text-center">
            {rate != null && rate > 0 ? (
              <RateBadge rate={rate} />
            ) : (
              <span className="text-[12px] text-slate-300">—</span>
            )}
          </td>
        )
      })}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Matrix table — always fully expanded                                */
/* ------------------------------------------------------------------ */

function MatrixTable({ matrix, kind }: { matrix: CashbackMatrix; kind: Kind }) {
  const { providers } = matrix
  const groups: MatrixGroup[] = matrix.groups ?? groupMatrixRows(matrix.rows, matrix.marketParts)

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="py-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Категория
            </th>
            {providers.map((p) => (
              <th key={p.key} className="px-2 py-2 text-center align-bottom">
                <div className="flex flex-col items-center gap-1">
                  {p.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.logo} alt={p.name} className="h-8 w-8 rounded-xl object-cover" />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-yellow-100 text-[12px] font-bold text-yellow-800">
                      {p.name[0]?.toUpperCase() ?? "?"}
                    </span>
                  )}
                  <span className="max-w-[64px] truncate text-[10px] leading-tight text-slate-500">
                    {p.name}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const hasSubs = groupHasSubcategories(group, kind)
            const providerCount = kind === "market" ? countProvidersInGroup(group) : 0
            const visibleRows =
              kind === "market"
                ? getVisibleMarketGroupRows(group)
                : getVisibleBankGroupRows(group)

            const resolveLabel = (row: (typeof visibleRows)[0]) =>
              kind === "market"
                ? resolveMarketRowCategory(row, providerCount)
                : row.category

            if (!hasSubs) {
              const row = group.rows[0]
              if (!row) return null
              return (
                <tr key={group.parent} className="border-t border-slate-100">
                  <td className="py-2 pr-4 text-[13px] font-medium text-slate-800">
                    {formatCategoryLabel(resolveLabel(row))}
                  </td>
                  <RateCells rates={row.rates} providers={providers} />
                </tr>
              )
            }

            const groupLabel = formatCategoryLabel(getMarketGroupDisplayLabel(group))

            return (
              <>
                {/* Group header */}
                <tr key={`${group.parent}-hdr`} className="border-t border-slate-100 bg-slate-50">
                  <td className="py-2 pr-4 text-[13px] font-semibold text-slate-700">
                    {groupLabel}
                  </td>
                  <RateCells rates={group.summaryRates} providers={providers} />
                </tr>
                {/* Children — always expanded */}
                {visibleRows.map((row, i) => (
                  <tr
                    key={`${group.parent}-${row.referenceNodeId ?? row.category}-${i}`}
                    className="border-t border-slate-100"
                  >
                    <td className="py-2 pl-4 pr-4 text-[12px] text-slate-600">
                      {formatCategoryLabel(resolveLabel(row))}
                    </td>
                    <RateCells rates={row.rates} providers={providers} />
                  </tr>
                ))}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ kind?: string }>
}) {
  const { id } = await params
  const { kind } = await searchParams
  const record = await fetchRecord(id)
  if (!record) notFound()

  const { period_month, period_year, bank_matrix, market_matrix } = record
  const periodLabel =
    period_month && period_year
      ? formatCashbackPeriod({ month: period_month, year: period_year })
      : record.title

  const showBank = kind !== "market" && !!bank_matrix && bank_matrix.rows.length > 0
  const showMarket = kind !== "bank" && !!market_matrix && market_matrix.rows.length > 0

  const kindLabel =
    kind === "bank" ? " — Банки" : kind === "market" ? " — Маркетплейсы" : ""

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <img src="/images/logo-icon.svg" alt="CashbackBrain" className="h-11 w-11 rounded-2xl" />
          <div>
            <p className="text-[12px] font-medium text-slate-400">CashbackBrain</p>
            <h1 className="text-[22px] font-bold leading-tight text-slate-900">
              Кешбэки за {periodLabel}{kindLabel}
            </h1>
          </div>
        </div>

        {showBank && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            {!kind && (
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Банки
              </p>
            )}
            <MatrixTable matrix={bank_matrix!} kind="bank" />
          </div>
        )}

        {showMarket && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            {!kind && (
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Маркетплейсы
              </p>
            )}
            <MatrixTable matrix={market_matrix!} kind="market" />
          </div>
        )}

        {!showBank && !showMarket && (
          <div className="rounded-2xl bg-white p-8 text-center text-slate-400 shadow-sm">
            Нет данных
          </div>
        )}

        <p className="text-center text-[12px] text-slate-400">
          Создано в{" "}
          <a href="/" className="text-slate-600 underline underline-offset-2">
            CashbackBrain
          </a>
        </p>
      </div>
    </div>
  )
}
