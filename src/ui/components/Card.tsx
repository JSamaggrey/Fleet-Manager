import type { ReactNode } from 'react';

export function Card({
  title,
  description,
  children,
  tone = 'default',
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  tone?: 'default' | 'danger';
}) {
  const border = tone === 'danger' ? 'border-red-300' : 'border-slate-200';
  return (
    <section className={`rounded-lg border bg-white p-5 shadow-sm ${border}`}>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description && <div className="mt-1 text-sm text-slate-600">{description}</div>}
      {children && <div className="mt-4 space-y-4">{children}</div>}
    </section>
  );
}

export function PageHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
    </header>
  );
}

export function DescriptionList({ items }: { items: [label: string, value: ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="font-medium text-slate-700">{label}</dt>
          <dd className="min-w-0 break-words text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'demo' | 'warning' | 'danger' | 'info';
}) {
  const colors = {
    neutral: 'bg-slate-100 text-slate-800',
    demo: 'bg-amber-100 text-amber-900',
    warning: 'bg-amber-100 text-amber-900',
    danger: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-900',
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${colors}`}
    >
      {children}
    </span>
  );
}
