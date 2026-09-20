export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col justify-center py-12"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      {children}
    </main>
  )
}
