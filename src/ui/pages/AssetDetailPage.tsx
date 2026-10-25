import { Archive, ArchiveRestore, Pencil, TrendingDown } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { AssetDetail } from '@/application/asset-service';
import { DEPRECIATION_CONVENTION } from '@/domain/depreciation';
import { formatMoney, subtract } from '@/domain/money';
import { formatYearMonth } from '@/domain/periods';
import { summarizeActivity } from '@/domain/transactions';
import type { Workspace } from '@/domain/workspace';
import { Alert } from '../components/Alert';
import { Button, FOCUS_RING } from '../components/Button';
import { Badge, Card, DescriptionList } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorState, LoadingState } from '../components/StateViews';
import { ScheduleTable } from '../assets/ScheduleTable';
import { formatDateTime } from '../format';
import { useAsset, useExpenseList, useRevenueList, useSetAssetStatus } from '../queries';

const linkButton = `inline-flex min-h-10 items-center gap-2 rounded-md bg-white px-4 text-sm font-medium text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 ${FOCUS_RING}`;

export function AssetDetailPage({ workspace }: { workspace: Workspace }) {
  const { id = '' } = useParams();
  const detail = useAsset(id);
  if (detail.isPending) return <LoadingState label="Loading asset…" />;
  if (detail.isError) {
    return (
      <ErrorState
        title="Asset could not be loaded"
        error={detail.error}
        onRetry={() => void detail.refetch()}
      />
    );
  }
  return <AssetDetailView detail={detail.data} workspace={workspace} />;
}

function AssetDetailView({ detail, workspace }: { detail: AssetDetail; workspace: Workspace }) {
  const { asset, category, position, lines, schedules } = detail;
  const a = asset.depreciation;
  const basis = subtract(a.capitalizedCost, a.residualValue);
  const tz = workspace.settings.timeZone;
  const vehicle = asset.vehicle;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link to="/assets" className={`text-blue-800 underline ${FOCUS_RING}`}>
          Assets
        </Link>
      </nav>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-slate-900">
            <span>{asset.code}</span>
            <span className="font-normal text-slate-700">{asset.name}</span>
            {asset.status === 'archived' && <Badge>Archived</Badge>}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{category.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/assets/${asset.id}/edit`} className={linkButton}>
            <Pencil aria-hidden="true" className="size-4" />
            Edit details
          </Link>
          <Link to={`/assets/${asset.id}/revise`} className={linkButton}>
            <TrendingDown aria-hidden="true" className="size-4" />
            Revise depreciation
          </Link>
          <StatusAction detail={detail} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Details">
          <DescriptionList
            items={[
              ['Acquired', asset.acquisitionDate],
              ['Location', asset.location ?? '—'],
              ['Supplier', asset.supplier ?? '—'],
              ...(vehicle
                ? ([
                    [
                      'Make / model',
                      [vehicle.make, vehicle.model].filter(Boolean).join(' ') || '—',
                    ],
                    ['Year', vehicle.year ?? '—'],
                    ['Registration', vehicle.registration ?? '—'],
                    ['Chassis / VIN', vehicle.vin ?? '—'],
                  ] as [string, string | number][])
                : []),
              ['Description', asset.description ?? '—'],
              ['Notes', asset.notes ?? '—'],
            ]}
          />
        </Card>

        <Card title={`Depreciation at end of ${formatYearMonth(detail.currentPeriod)}`}>
          <DescriptionList
            items={[
              ['Capitalised cost', formatMoney(a.capitalizedCost)],
              ['Residual value', formatMoney(a.residualValue)],
              ['Depreciable basis', formatMoney(basis)],
              [
                'Useful life',
                `${a.usefulLifeMonths} months from ${formatYearMonth(a.inServiceDate.slice(0, 7))}`,
              ],
              ['Accumulated depreciation', formatMoney(position.accumulated)],
              ['Book value', <strong key="bv">{formatMoney(position.bookValue)}</strong>],
              [
                'Status',
                {
                  'not-started': 'Not started yet',
                  depreciating: 'Depreciating',
                  'fully-depreciated': 'Fully depreciated',
                }[position.state],
              ],
              ['Schedule version', `v${schedules.at(-1)?.version ?? 1}`],
              [
                'Closed through',
                detail.closedThrough
                  ? formatYearMonth(detail.closedThrough)
                  : 'No months closed yet',
              ],
            ]}
          />
          <p className="text-xs text-slate-600">
            {DEPRECIATION_CONVENTION} Depreciation is a non-cash cost; the purchase is not an
            operating expense.
          </p>
        </Card>
      </div>

      <div className="mt-6">
        <AssetActivityCard assetId={asset.id} />
      </div>

      <section className="mt-6" aria-labelledby="schedule-heading">
        <h2 id="schedule-heading" className="mb-2 text-base font-semibold text-slate-900">
          Monthly schedule
        </h2>
        <ScheduleTable
          lines={lines}
          closedThrough={detail.closedThrough}
          currentPeriod={detail.currentPeriod}
          caption={`Depreciation schedule for ${asset.code}`}
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card
          title="Schedule versions"
          description="Earlier versions are kept; closed months are never rewritten."
        >
          <ol className="space-y-2 text-sm">
            {[...schedules].reverse().map((s) => (
              <li key={s.id} className="rounded border border-slate-200 p-2">
                <p className="font-medium">
                  v{s.version} · from {formatYearMonth(s.effectiveFrom)}
                </p>
                <p className="text-slate-700">
                  {formatMoney(s.assumptions.capitalizedCost)} cost,{' '}
                  {formatMoney(s.assumptions.residualValue)} residual,{' '}
                  {s.assumptions.usefulLifeMonths} months
                </p>
                <p className="text-xs text-slate-500">
                  {s.reason} · {formatDateTime(s.createdAt, tz)}
                </p>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="History">
          <ol className="space-y-2 text-sm">
            {detail.history.map((event) => (
              <li key={event.id}>
                <p className="font-medium text-slate-900">{event.summary}</p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(event.occurredAt, tz)} · {event.action}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}

/** All-time recorded activity for one asset. Profit and margin come with the reports. */
function AssetActivityCard({ assetId }: { assetId: string }) {
  const revenue = useRevenueList();
  const expenses = useExpenseList();
  const totals =
    revenue.data && expenses.data
      ? summarizeActivity(
          revenue.data.filter((r) => r.entry.assetId === assetId).map((r) => r.entry),
          expenses.data.filter((r) => r.expense.assetId === assetId).map((r) => r.expense),
          'GHS',
        )
      : null;
  return (
    <Card
      title="Revenue and expenses (all dates)"
      description="Recorded against this asset; voided records excluded. Shared fleet costs are not allocated to assets."
    >
      {totals && (
        <DescriptionList
          items={[
            ['Revenue', formatMoney(totals.revenue)],
            ['Direct operating expenses', formatMoney(totals.directExpenses)],
            ['Capital items (not operating)', formatMoney(totals.capitalItems)],
          ]}
        />
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link to={`/revenue?asset=${assetId}`} className={`text-blue-800 underline ${FOCUS_RING}`}>
          View revenue
        </Link>
        <Link to={`/expenses?asset=${assetId}`} className={`text-blue-800 underline ${FOCUS_RING}`}>
          View expenses
        </Link>
        <Link
          to={`/revenue/new?asset=${assetId}`}
          className={`text-blue-800 underline ${FOCUS_RING}`}
        >
          Record revenue
        </Link>
        <Link
          to={`/expenses/new?asset=${assetId}`}
          className={`text-blue-800 underline ${FOCUS_RING}`}
        >
          Record expense
        </Link>
      </div>
    </Card>
  );
}

function StatusAction({ detail }: { detail: AssetDetail }) {
  const { asset } = detail;
  const setStatus = useSetAssetStatus(asset.id);
  const [open, setOpen] = useState(false);
  const archiving = asset.status === 'active';

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {archiving ? (
          <Archive aria-hidden="true" className="size-4" />
        ) : (
          <ArchiveRestore aria-hidden="true" className="size-4" />
        )}
        {archiving ? 'Archive' : 'Reactivate'}
      </Button>
      <Button variant="secondary" disabled title="Disposal policy not yet approved">
        Retire / dispose
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={archiving ? `Archive ${asset.code}?` : `Reactivate ${asset.code}?`}
        description={
          archiving ? (
            <>
              <p>Archived assets are hidden from the default asset list.</p>
              <p>
                Archiving is <strong>not</strong> a disposal: depreciation continues and history is
                kept. Retirement and disposal need an approved policy and are not available yet.
              </p>
            </>
          ) : (
            <p>The asset will appear in the active asset list again.</p>
          )
        }
        confirmLabel={archiving ? 'Archive asset' : 'Reactivate asset'}
        pending={setStatus.isPending}
        onConfirm={() =>
          setStatus.mutate(archiving ? 'archived' : 'active', { onSuccess: () => setOpen(false) })
        }
      >
        {setStatus.isError && (
          <Alert tone="danger" title="Not changed">
            <p>{setStatus.error.message}</p>
          </Alert>
        )}
      </ConfirmDialog>
    </>
  );
}
