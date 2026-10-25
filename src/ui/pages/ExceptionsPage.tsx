import { Link } from 'react-router';
import type { ExceptionItem, ExceptionsView } from '@/application/report-service';
import { formatMoney } from '@/domain/money';
import { formatYearMonth } from '@/domain/periods';
import { Alert } from '../components/Alert';
import { Card, PageHeader } from '../components/Card';
import { ErrorState, LoadingState } from '../components/StateViews';
import { useExceptions } from '../queries';
import { TEXT_LINK } from '../transactions/list-controls';

const PATH: Record<ExceptionItem['kind'], string> = {
  revenue: '/revenue',
  expense: '/expenses',
  asset: '/assets',
};

function ItemList({ items, empty }: { items: ExceptionItem[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-slate-600">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {items.map((item) => (
        <li
          key={`${item.kind}-${item.id}-${item.detail}`}
          className="flex flex-wrap gap-x-4 gap-y-1 py-2"
        >
          <Link to={`${PATH[item.kind]}/${item.id}`} className={TEXT_LINK}>
            {item.label}
          </Link>
          {item.date && <span className="text-slate-600">{item.date}</span>}
          {item.amount && <span className="tabular-nums">{formatMoney(item.amount)}</span>}
          <span className="w-full text-slate-700">{item.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export function ExceptionsPage() {
  const exceptions = useExceptions();
  return (
    <>
      <PageHeader
        title="Exceptions"
        description="Records that need attention, all dates. Only checks based on data this app actually collects."
      />
      {exceptions.isPending && <LoadingState label="Checking records…" />}
      {exceptions.isError && (
        <ErrorState
          title="Exceptions could not be checked"
          error={exceptions.error}
          onRetry={() => void exceptions.refetch()}
        />
      )}
      {exceptions.data && <ExceptionsBody data={exceptions.data} />}
    </>
  );
}

function ExceptionsBody({ data }: { data: ExceptionsView }) {
  const count = (n: number) => ` (${n})`;
  return (
    <div className="space-y-6">
      {data.total === 0 && !data.unclosedMonths && (
        <Alert tone="success" title="Nothing needs attention">
          <p>Every revenue entry and expense is assigned and asset records are complete.</p>
        </Alert>
      )}
      {data.unclosedMonths && (
        <Alert tone="info" title="Depreciation months not yet closed">
          <p>
            {data.unclosedMonths.count} ended month{data.unclosedMonths.count === 1 ? '' : 's'} (
            {formatYearMonth(data.unclosedMonths.from)} to {formatYearMonth(data.unclosedMonths.to)}
            ) can still be revised. Close them on the{' '}
            <Link to="/depreciation" className="underline">
              Depreciation
            </Link>{' '}
            page once figures are final.
          </p>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={`Revenue without an asset${count(data.unassignedRevenue.length)}`}
          description="Counted in fleet revenue only. Correct each entry to assign the asset that earned it."
        >
          <ItemList items={data.unassignedRevenue} empty="None." />
        </Card>
        <Card
          title={`Unclassified expenses${count(data.unassignedExpenses.length)}`}
          description="Deducted only in fleet profit. Correct each to mark it direct or shared."
        >
          <ItemList items={data.unassignedExpenses} empty="None." />
        </Card>
        <Card title={`Incomplete asset setup${count(data.incompleteAssets.length)}`}>
          <ItemList items={data.incompleteAssets} empty="None." />
        </Card>
        <Card
          title={`Depreciation schedule review${count(data.scheduleReview.length)}`}
          description="Revisions are confirmed when saved, so none are waiting for confirmation."
        >
          <ItemList items={data.scheduleReview} empty="None." />
        </Card>
      </div>
      <Card
        title={`Voided records${count(data.voided.length)}`}
        description="For review only: voided records are already excluded from every total. Newest void first."
      >
        <ItemList items={data.voided} empty="No records have been voided." />
      </Card>
    </div>
  );
}
