import { Pencil } from 'lucide-react';
import { Link, useParams } from 'react-router';
import type { RevenueDetail } from '@/application/revenue-service';
import { formatMoney } from '@/domain/money';
import { PAYMENT_STATUS_LABEL, RECOGNITION_BASIS } from '@/domain/transactions';
import type { Workspace } from '@/domain/workspace';
import { Alert } from '../components/Alert';
import { FOCUS_RING } from '../components/Button';
import { Card, DescriptionList } from '../components/Card';
import { ErrorState, LoadingState } from '../components/StateViews';
import { formatDateTime } from '../format';
import { useRevenueEntry, useVoidRevenue } from '../queries';
import { HistoryCard } from '../transactions/HistoryCard';
import {
  AssetCell,
  SECONDARY_LINK,
  UnassignedBadge,
  VoidedBadge,
} from '../transactions/list-controls';
import { VoidAction } from '../transactions/VoidAction';

export function RevenueDetailPage({ workspace }: { workspace: Workspace }) {
  const { id = '' } = useParams();
  const detail = useRevenueEntry(id);
  if (detail.isPending) return <LoadingState label="Loading revenue entry…" />;
  if (detail.isError) {
    return (
      <ErrorState
        title="Revenue entry could not be loaded"
        error={detail.error}
        onRetry={() => void detail.refetch()}
      />
    );
  }
  return <RevenueDetailView detail={detail.data} workspace={workspace} />;
}

function RevenueDetailView({ detail, workspace }: { detail: RevenueDetail; workspace: Workspace }) {
  const { entry, asset } = detail;
  const voidMutation = useVoidRevenue(entry.id);
  const tz = workspace.settings.timeZone;
  const route = [entry.origin, entry.destination].filter(Boolean).join(' → ');

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link to="/revenue" className={`text-blue-800 underline ${FOCUS_RING}`}>
          Revenue
        </Link>
      </nav>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-slate-900">
            <span>{entry.reference}</span>
            <span className="font-normal text-slate-700">{formatMoney(entry.amount)}</span>
            {entry.void && <VoidedBadge />}
            {!asset && <UnassignedBadge />}
          </h1>
          <p className="mt-1 text-sm text-slate-600">Service date {entry.serviceDate}</p>
        </div>
        {!entry.void && (
          <div className="flex flex-wrap gap-2">
            <Link to={`/revenue/${entry.id}/edit`} className={SECONDARY_LINK}>
              <Pencil aria-hidden="true" className="size-4" />
              Correct
            </Link>
            <VoidAction
              what="revenue entry"
              label={`${entry.reference} on ${entry.serviceDate}, ${formatMoney(entry.amount)}`}
              mutation={voidMutation}
            />
          </div>
        )}
      </header>

      {entry.void && (
        <div className="mb-6">
          <Alert tone="danger" title="Voided — excluded from all totals">
            <p>
              {formatDateTime(entry.void.voidedAt, tz)}. Reason: {entry.void.reason}
            </p>
          </Alert>
        </div>
      )}
      {!entry.void && !asset && (
        <div className="mb-6">
          <Alert tone="warning" title="No asset assigned">
            <p>
              This revenue counts in fleet revenue but in no asset’s results. Use{' '}
              <strong>Correct</strong> to assign the asset that earned it.
            </p>
          </Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Details" description={RECOGNITION_BASIS}>
          <DescriptionList
            items={[
              ['Service date', entry.serviceDate],
              ['Reference', entry.reference],
              ['Asset', asset ? <AssetCell key="a" asset={asset} /> : 'Unassigned'],
              ['Customer / contract', entry.customer ?? '—'],
              ['Description', entry.description ?? '—'],
              ['Route', route || '—'],
              [
                'Distance / quantity',
                entry.quantity ? `${entry.quantity} ${entry.quantityUnit ?? ''}`.trim() : '—',
              ],
              ['Rate', entry.rate ? formatMoney(entry.rate) : '—'],
              ['Amount', <strong key="amt">{formatMoney(entry.amount)}</strong>],
              [
                'Payment status',
                entry.paymentStatus ? PAYMENT_STATUS_LABEL[entry.paymentStatus] : 'Not recorded',
              ],
              ['Notes', entry.notes ?? '—'],
              ['Recorded', formatDateTime(entry.createdAt, tz)],
            ]}
          />
        </Card>
        <HistoryCard events={detail.history} timeZone={tz} />
      </div>
    </>
  );
}
