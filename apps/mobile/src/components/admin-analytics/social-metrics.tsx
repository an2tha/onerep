export function SocialMetrics({
  metrics,
}: {
  metrics: { label: string; value: string; detail: string }[]
}) {
  const available = metrics.filter((metric) => metric.value !== "Unavailable")
  const unavailable = metrics.filter((metric) => metric.value === "Unavailable")
  return (
    <>
      {available.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-5 gap-y-6 p-5 sm:grid-cols-3 sm:p-6 xl:grid-cols-6">
          {available.map((metric) => (
            <div key={metric.label}>
              <dt className="text-xs font-medium text-muted-foreground">
                {metric.label}
              </dt>
              <dd className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
                {metric.value}
              </dd>
              <dd className="mt-2 text-[11px] leading-5 text-muted-foreground">
                {metric.detail}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {unavailable.length > 0 && (
        <details className="border-t border-border px-5 py-3 text-xs text-muted-foreground sm:px-6">
          <summary className="w-fit cursor-pointer">
            Unavailable metrics ({unavailable.length})
          </summary>
          <p className="mt-3">
            These appear automatically when verified data is available.
          </p>
          <dl className="mt-3 divide-y divide-border">
            {unavailable.map((metric) => (
              <div
                className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2"
                key={metric.label}
              >
                <dt className="font-medium text-foreground">{metric.label}</dt>
                <dd>Unavailable · {metric.detail}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </>
  )
}
