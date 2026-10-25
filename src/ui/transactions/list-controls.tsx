import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { AssetRef } from '@/application/transaction-records';
import { FOCUS_RING } from '../components/Button';
import { Badge } from '../components/Card';
import { INPUT_CLASS } from '../components/Field';

export const PRIMARY_LINK = `inline-flex min-h-10 items-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 ${FOCUS_RING}`;
export const SECONDARY_LINK = `inline-flex min-h-10 items-center gap-2 rounded-md bg-white px-4 text-sm font-medium text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 ${FOCUS_RING}`;
export const TEXT_LINK = `font-medium text-blue-800 underline-offset-2 hover:underline ${FOCUS_RING}`;

export function FilterField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: (props: { id: string; className: string }) => ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">
        {label}
      </label>
      {children({ id, className: INPUT_CLASS })}
    </div>
  );
}

export function AssetCell({ asset }: { asset: AssetRef }) {
  return (
    <Link to={`/assets/${asset.id}`} className={TEXT_LINK}>
      {asset.code}
    </Link>
  );
}

export function UnassignedBadge() {
  return <Badge tone="warning">Unassigned</Badge>;
}

export function VoidedBadge() {
  return <Badge tone="danger">Voided</Badge>;
}
