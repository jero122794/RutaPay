// frontend/app/offline/page.tsx
"use client";

const OfflinePage = (): JSX.Element => {
  return (
    <main className="min-h-screen bg-bg p-6">
      <section className="mx-auto max-w-md rounded-xl border border-border bg-surface p-6">
        <h1 className="text-2xl font-semibold text-textPrimary">Sin conexión</h1>
        <p className="mt-3 text-sm text-textSecondary">
          Estás trabajando sin internet. Algunas funciones pueden no estar disponibles hasta que recuperes la
          conexión.
        </p>
      </section>
    </main>
  );
};

export default OfflinePage;
