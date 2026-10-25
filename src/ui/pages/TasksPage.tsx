import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  TASK_CATEGORY_LABEL,
  TASK_RULES,
  deriveTasks,
  type Task,
  type TaskCategory,
  type TaskPriority,
} from '@/application/tasks';
import { Alert } from '../components/Alert';
import { Badge, Card, PageHeader } from '../components/Card';
import { INPUT_CLASS } from '../components/Field';
import { ErrorState, LoadingState } from '../components/StateViews';
import { useExceptions } from '../queries';
import { TEXT_LINK } from '../transactions/list-controls';

const PRIORITY_TONE: Record<TaskPriority, 'danger' | 'warning' | 'neutral'> = {
  high: 'danger',
  normal: 'warning',
  low: 'neutral',
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

export function TasksPage() {
  const exceptions = useExceptions();
  const [category, setCategory] = useState<TaskCategory | ''>('');
  const tasks = useMemo(
    () => (exceptions.data ? deriveTasks(exceptions.data) : []),
    [exceptions.data],
  );
  const shown = tasks.filter((t) => category === '' || t.category === category);

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Work to do, worked out from this workspace’s records. A task disappears when you fix its source record."
      />
      {exceptions.isPending && <LoadingState label="Checking records…" />}
      {exceptions.isError && (
        <ErrorState
          title="Tasks could not be worked out"
          error={exceptions.error}
          onRetry={() => void exceptions.refetch()}
        />
      )}
      {exceptions.data && (
        <div className="space-y-6">
          {tasks.length === 0 ? (
            <Alert tone="success" title="No open tasks">
              <p>Every record is assigned and complete, and depreciation months are closed.</p>
            </Alert>
          ) : (
            <>
              <div className="max-w-xs">
                <label
                  htmlFor="task-category"
                  className="mb-1 block text-sm font-medium text-slate-800"
                >
                  Category
                </label>
                <select
                  id="task-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TaskCategory | '')}
                  className={INPUT_CLASS}
                >
                  <option value="">All ({tasks.length})</option>
                  {Object.entries(TASK_CATEGORY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label} ({tasks.filter((t) => t.category === value).length})
                    </option>
                  ))}
                </select>
              </div>
              <ol
                aria-label="Open tasks"
                className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm"
              >
                {shown.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </ol>
            </>
          )}
          <Card title="How tasks are worked out">
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {TASK_RULES.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
              <li>
                Tasks are not stored or assigned to people, and have no history of their own. The
                audit log records the fixes.
              </li>
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}

function TaskRow({ task }: { task: Task }) {
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-1 p-4 text-sm">
      <Badge tone={PRIORITY_TONE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">
          <Link to={task.link} className={TEXT_LINK}>
            {task.title}
          </Link>
        </p>
        <p className="text-slate-700">{task.detail}</p>
        <p className="text-xs text-slate-500">
          {TASK_CATEGORY_LABEL[task.category]}
          {task.since && ` · record dated ${task.since}`}
        </p>
      </div>
    </li>
  );
}
