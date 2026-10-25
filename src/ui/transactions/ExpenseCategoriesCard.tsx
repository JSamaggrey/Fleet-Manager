import { useState } from 'react';
import type { ExpenseCategory } from '@/domain/transactions';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { INPUT_CLASS } from '../components/Field';
import { ErrorState, LoadingState } from '../components/StateViews';
import {
  useCreateExpenseCategory,
  useExpenseCategories,
  useUpdateExpenseCategory,
} from '../queries';

export function ExpenseCategoriesCard() {
  const categories = useExpenseCategories();
  const create = useCreateExpenseCategory();
  const [name, setName] = useState('');

  return (
    <Card
      title="Expense categories"
      description="Archived categories stay on existing expenses but cannot be chosen for new ones."
    >
      {categories.isPending && <LoadingState label="Loading expense categories…" />}
      {categories.isError && (
        <ErrorState title="Expense categories could not be loaded" error={categories.error} />
      )}
      {categories.data && (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {categories.data.map((c) => (
            <CategoryRow key={`${c.id}-${c.updatedAt}`} category={c} />
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(name, { onSuccess: () => setName('') });
        }}
      >
        <div>
          <label
            htmlFor="new-expense-category"
            className="mb-1 block text-sm font-medium text-slate-800"
          >
            New expense category
          </label>
          <input
            id="new-expense-category"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={create.isPending || name.trim() === ''}>
          Add expense category
        </Button>
      </form>
      {create.isError && (
        <Alert tone="danger" title="Category not added">
          <p>{create.error.message}</p>
        </Alert>
      )}
    </Card>
  );
}

function CategoryRow({ category }: { category: ExpenseCategory }) {
  const update = useUpdateExpenseCategory();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const save = (archived: boolean) =>
    update.mutate({ id: category.id, name, archived }, { onSuccess: () => setEditing(false) });

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
      {editing ? (
        <>
          <input
            aria-label={`Name for ${category.name}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${INPUT_CLASS} max-w-56`}
          />
          <Button
            variant="secondary"
            onClick={() => save(category.archived)}
            disabled={update.isPending}
          >
            Save
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          <span
            className={`flex-1 font-medium ${category.archived ? 'text-slate-400 line-through' : ''}`}
          >
            {category.name}
          </span>
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Edit<span className="sr-only"> {category.name}</span>
          </Button>
          <Button
            variant="ghost"
            onClick={() => save(!category.archived)}
            disabled={update.isPending}
          >
            {category.archived ? 'Restore' : 'Archive'}
            <span className="sr-only"> {category.name}</span>
          </Button>
        </>
      )}
      {update.isError && <p className="w-full text-red-700">{update.error.message}</p>}
    </li>
  );
}
