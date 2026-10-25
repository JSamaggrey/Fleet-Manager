import { formatMoney, money, REPORTING_CURRENCY } from '@/domain/money';

export function App() {
  return (
    <main className="mx-auto max-w-3xl p-8 font-sans text-slate-900">
      <h1 className="text-2xl font-semibold">Fleet &amp; Asset Management</h1>
      <p className="mt-2 text-slate-600">
        Phase 0 scaffold. This app keeps data in a local workspace on this device only; it does not
        sync between devices.
      </p>
      <dl className="mt-6 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="font-medium">Reporting currency</dt>
        <dd>{REPORTING_CURRENCY}</dd>
        <dt className="font-medium">Format check</dt>
        <dd>{formatMoney(money(123456, REPORTING_CURRENCY))}</dd>
      </dl>
    </main>
  );
}
