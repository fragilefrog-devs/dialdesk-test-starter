export default function BusinessPageLoading() {
  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
        <div className="skeleton h-9 w-36" />
        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
          <section className="space-y-5">
            <div className="skeleton h-4 w-28" />
            <div className="skeleton h-12 w-3/4" />
            <div className="skeleton h-5 w-full max-w-xl" />
            <div className="skeleton mt-10 h-52 w-full" />
          </section>
          <div className="skeleton h-[600px] w-full rounded-[15px]" />
        </div>
      </div>
    </main>
  )
}
