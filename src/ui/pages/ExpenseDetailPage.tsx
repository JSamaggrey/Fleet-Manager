import { Pencil } from 'lucide-react';
import { Link, useParams } from 'react-router';
import type { ExpenseDetail } from '@/application/expense-service';
import { formatMoney } from '@/domain/money';
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  RECOGNITION_BASIS,
  expenseBucket,
  type ExpenseBucket,
} from '@/domain/transactions';
import type { Workspace } from '@/domain/workspace';
import { Alert } from '../components/Alert';
import { FOCUS_RING } from '../components/Button';
import { Badge, Card, DescriptionList } from '../components/Card';
import { ErrorState, LoadingState } from '../components/StateViews';
import { formatDateTime } from '../format';
import { useExpense, useVoidExpense } from '../queries';
import { HistoryCard } from '../transactions/HistoryCard';
import {
  AssetCell,
  SECONDARY_LINK,
  UnassignedBadge,
  VoidedBadge,
} from '../transactions/list-controls';
import { VoidAction } from '../transactions/VoidAction';

const TREATMENT: Record<ExpenseBucket, string> = {
  direct: 'Direct operating expense: deducted in this asset’s management profit.',
  shared:
    'Shared / fleet expense: shown separately and deducted only in fleet profit. Not allocated to assets.',
  unassigned: 'Unassigned operating expense: needs classifying before asset results are complete.',
  capital: 'Capital item: recorded for reference, not deducted as an operating expense.',
};

export function ExpenseDetailPage({ workspace }: { workspace: Workspace }) {
  const { id = '' } = useParams();
  const detail = useExpense(id);
  if (detail.isPending) return <LoadingState label="Loading expense…" />;
  if (detail.isError) {
    return (
      <ErrorState
        title="Expense could not be loaded"
        error={detail.error}
        onRetry={() => void detail.refetch()}
      />
    );
  }
  return <ExpenseDetailView detail={detail.data} workspace={workspace} />;
}

function ExpenseDetailView({ detail, workspace }: { detail: ExpenseDetail; workspace: Workspace }) {
  const { expense, asset, categoryName } = detail;
  const voidMutation = useVoidExpense(expense.id);
  const tz = workspace.settings.timeZone;
  const bucket = expenseBucket(expense);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link to="/expenses" className={`text-blue-800 underline ${FOCUS_RING}`}>
          Expenses
        </Link>
      </nav>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-slate-900">
            <span>{categoryName}</span>
            <span className="font-normal text-slate-700">{formatMoney(expense.amount)}</span>
            {expense.void && <VoidedBadge />}
            {expense.assignment === 'unassigned' && <UnassignedBadge />}
            {expense.assignment === 'shared' && <Badge tone="info">Shared / fleet</Badge>}
            {expense.nature === 'capital' && <Badge>Capital</Badge>}
          </h1>
          <p className="mt-1 text-sm text-slate-600">Expense date {expense.expenseDate}</p>
        </div>
        {!expense.void && (
          <div className="flex flex-wrap gap-2">
            <Link to={`/expenses/${expense.id}/edit`} className={SECONDARY_LINK}>
              <Pencil aria-hidden="true" className="size-4" />
              Correct
            </Link>
            <VoidAction
              what="expense"
              label={`${categoryName} on ${expense.expenseDate}, ${formatMoney(expense.amount)}`}
              mutation={voidMutation}
            />
          </div>
        )}
      </header>

      {expense.void ? (
        <div className="mb-6">
          <Alert tone="danger" title="Voided — excluded from all totals">
            <p>
              {formatDateTime(expense.void.voidedAt, tz)}. Reason: {expense.void.reason}
            </p>
          </Alert>
        </div>
      ) : (
        expense.assignment === 'unassigned' && (
          <div className="mb-6">
            <Alert tone="warning" title="Not yet classified">
              <p>
                Use <strong>Correct</strong> to mark it as a direct cost of an asset or as a shared
                fleet cost.
              </p>
            </Alert>
          </div>
        )
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Details" description={RECOGNITION_BASIS}>
          <DescriptionList
            items={[
              ['Expense date', expense.expenseDate],
              ['Category', categoryName],
              [
                'Applies to',
                expense.assignment === 'asset' && asset ? (
                  <AssetCell key="a" asset={asset} />
                ) : expense.assignment === 'shared' ? (
                  'Shared / fleet'
                ) : (
                  'Unassigned'
                ),
              ],
              ['Treatment', TREATMENT[bucket]],
              ['Amount', <strong key="amt">{formatMoney(expense.amount)}</strong>],
              ['Vendor', expense.vendor ?? '—'],
              ['Receipt / reference', expense.reference ?? '—'],
              ['Description', expense.description ?? '—'],
              [
                'Payment',
                [
                  expense.paymentStatus ? PAYMENT_STATUS_LABEL[expense.paymentStatus] : null,
                  expense.paymentMethod ? PAYMENT_METHOD_LABEL[expense.paymentMethod] : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Not recorded',
              ],
              ['Notes', expense.notes ?? '—'],
              ['Recorded', formatDateTime(expense.createdAt, tz)],
            ]}
          />
        </Card>
        <HistoryCard events={detail.history} timeZone={tz} />
      </div>
    </>
  );
}
