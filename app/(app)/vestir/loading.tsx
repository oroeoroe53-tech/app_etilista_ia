import { Shimmer } from '@/components/ui/Skeletons'

/** Respuesta inmediata al tocar. Ver `app/(app)/social/loading.tsx`. */
export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <div className="pt-5">
        <Shimmer className="h-2 w-24" />
        <Shimmer className="mt-4 h-7 w-2/3" />
        <Shimmer className="mt-2 h-7 w-1/2" />
      </div>

      <div className="mt-8 space-y-2.5">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="rounded-[22px] border border-line p-3.5">
            <Shimmer className="h-4 w-44" />
            <Shimmer className="mt-2 h-2.5 w-52" />
          </div>
        ))}
      </div>
    </div>
  )
}
