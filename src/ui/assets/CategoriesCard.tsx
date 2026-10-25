import { useState } from 'react';
import type { AssetCategory } from '@/domain/assets';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { INPUT_CLASS } from '../components/Field';
import { ErrorState, LoadingState } from '../components/StateViews';
import { useCategories, useCreateCategory, useUpdateCategory } from '../queries';

export function CategoriesCard() {
  const categories = useCategories();
  const create = useCreateCategory();
  const [name, setName] = useState('');
  const [usesVehicleFields, setUsesVehicleFields] = useState(true);

  return (
    <Card
      title="Asset categories"
      description="Vehicle categories show make, model and registration fields. Archived categories stay on existing assets but cannot be chosen for new ones."
    >
      {categories.isPending && <LoadingState label="Loading categories…" />}
      {categories.isError && (
        <ErrorState title="Categories could not be loaded" error={categories.error} />
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
          create.mutate({ name, usesVehicleFields }, { onSuccess: () => setName('') });
        }}
      >
        <div>
          <label htmlFor="new-category" className="mb-1 block text-sm font-medium text-slate-800">
            New category
          </label>
          <input
            id="new-category"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={usesVehicleFields}
            onChange={(e) => setUsesVehicleFields(e.target.checked)}
          />
          Vehicle fields
        </label>
        <Button type="submit" variant="secondary" disabled={create.isPending || name.trim() === ''}>
          Add category
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

function CategoryRow({ category }: { category: AssetCategory }) {
  const update = useUpdateCategory();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [usesVehicleFields, setUsesVehicleFields] = useState(category.usesVehicleFields);
  const save = (patch: Partial<{ name: string; usesVehicleFields: boolean; archived: boolean }>) =>
    update.mutate(
      { id: category.id, name, usesVehicleFields, archived: category.archived, ...patch },
      { onSuccess: () => setEditing(false) },
    );

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
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={usesVehicleFields}
              onChange={(e) => setUsesVehicleFields(e.target.checked)}
            />
            Vehicle fields
          </label>
          <Button variant="secondary" onClick={() => save({})} disabled={update.isPending}>
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
          <span className="text-slate-600">
            {category.usesVehicleFields ? 'Vehicle fields' : 'No vehicle fields'}
          </span>
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Edit<span className="sr-only"> {category.name}</span>
          </Button>
          <Button
            variant="ghost"
            onClick={() => save({ archived: !category.archived })}
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
