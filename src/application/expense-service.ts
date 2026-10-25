import type { z } from 'zod';
import { diffFields, type AuditEvent } from '@/domain/audit';
import { formatMoney } from '@/domain/money';
import {
  expenseCategorySchema,
  expenseDetailsSchema,
  type Expense,
  type ExpenseCategory,
} from '@/domain/transactions';
import type { Workspace } from '@/domain/workspace';
import type { Repositories } from '@/repositories';
import { auditEvent, requireWorkspace, type RecordContext } from './asset-records';
import type { ServiceDependencies } from './dependencies';
import { NotFoundError, ValidationError } from './errors';
import {
  AlreadyVoidedError,
  assetRef,
  assetRefs,
  createdChanges,
  moneyAuditText,
  parseOrThrow,
  rejectFutureDate,
  requireAssetForRecord,
  voidInfo,
  type AssetRef,
} from './transaction-records';

export type ExpenseInput = z.input<typeof expenseDetailsSchema>;

export interface ExpenseRow {
  expense: Expense;
  categoryName: string;
  /** Set for direct asset expenses. */
  asset: AssetRef | null;
}

export interface ExpenseDetail extends ExpenseRow {
  history: AuditEvent[];
}

export interface ExpenseCategoryInput {
  name: string;
  archived: boolean;
}

export function byExpenseDateDesc(a: Expense, b: Expense): number {
  return b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt);
}

const ASSIGNMENT_AUDIT: Record<Expense['assignment'], string> = {
  asset: 'Direct (asset)',
  shared: 'Shared / fleet',
  unassigned: 'Unassigned',
};

function auditView(expense: Expense, asset: AssetRef | null, categoryName: string) {
  return {
    expenseDate: expense.expenseDate,
    assignment: ASSIGNMENT_AUDIT[expense.assignment],
    asset: asset?.code ?? null,
    category: categoryName,
    nature: expense.nature,
    vendor: expense.vendor,
    reference: expense.reference,
    description: expense.description,
    amount: moneyAuditText(expense.amount),
    paymentStatus: expense.paymentStatus,
    paymentMethod: expense.paymentMethod,
    notes: expense.notes,
  };
}

function describe(expense: Expense, asset: AssetRef | null, categoryName: string): string {
  const target = expense.assignment === 'asset' ? (asset?.code ?? 'asset') : expense.assignment;
  return `${categoryName} on ${expense.expenseDate}, ${formatMoney(expense.amount)}, ${target}${
    expense.nature === 'capital' ? ' (capital)' : ''
  }`;
}

async function categoryName(repos: Repositories, id: string): Promise<string> {
  return (await repos.expenseCategories.get(id))?.name ?? 'Unknown category';
}

async function refFor(repos: Repositories, assetId: string | null): Promise<AssetRef | null> {
  if (assetId === null) return null;
  const asset = await repos.assets.get(assetId);
  return asset ? assetRef(asset) : null;
}

async function validate(
  repos: Repositories,
  workspace: Workspace,
  input: ExpenseInput,
  at: Date,
  existing?: Expense,
) {
  const details = parseOrThrow(expenseDetailsSchema, input, 'Invalid expense.');
  rejectFutureDate(details.expenseDate, workspace, at, 'expenseDate', 'Expense date');
  const category = await repos.expenseCategories.get(details.categoryId);
  if (!category) throw new ValidationError('Choose an expense category.', 'categoryId');
  if (category.archived && existing?.categoryId !== category.id) {
    throw new ValidationError('This category is archived. Choose another.', 'categoryId');
  }
  const asset =
    details.assetId === null ? null : assetRef(await requireAssetForRecord(repos, details.assetId));
  return { details, asset, category };
}

/** Validates and stores a new expense with its audit event, inside a write. */
export async function insertExpense(
  repos: Repositories,
  ctx: RecordContext,
  workspace: Workspace,
  input: ExpenseInput,
): Promise<Expense> {
  const { details, asset, category } = await validate(repos, workspace, input, ctx.at);
  const timestamp = ctx.at.toISOString();
  const expense: Expense = {
    id: ctx.newId(),
    workspaceId: workspace.id,
    ...details,
    void: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await repos.expenses.put(expense);
  await repos.audit.append(
    auditEvent(
      ctx,
      workspace,
      { type: 'expense', id: expense.id },
      'expense.recorded',
      `Expense recorded: ${describe(expense, asset, category.name)}`,
      createdChanges(auditView(expense, asset, category.name)),
    ),
  );
  return expense;
}

export function createExpenseService(deps: ServiceDependencies) {
  const { store, newId, now, actor } = deps;
  const context = (): RecordContext => ({ newId, actor, at: now() });

  async function requireExpense(repos: Repositories, id: string): Promise<Expense> {
    const expense = await repos.expenses.get(id);
    if (!expense) throw new NotFoundError('Expense not found.');
    return expense;
  }

  async function validateCategoryName(repos: Repositories, name: string, existingId?: string) {
    const parsed = parseOrThrow(expenseCategorySchema.shape.name, name, 'Invalid name.');
    const clash = (await repos.expenseCategories.list()).find(
      (c) => c.id !== existingId && c.name.toLowerCase() === parsed.toLowerCase(),
    );
    if (clash) throw new ValidationError(`A category named ${clash.name} already exists.`, 'name');
    return parsed;
  }

  return {
    async listExpenseCategories(): Promise<ExpenseCategory[]> {
      const categories = await store.read((repos) => repos.expenseCategories.list());
      return categories.sort((a, b) => a.name.localeCompare(b.name));
    },

    async createExpenseCategory(name: string): Promise<ExpenseCategory> {
      const ctx = context();
      return store.write(async (repos) => {
        const workspace = await requireWorkspace(repos);
        const validName = await validateCategoryName(repos, name);
        const timestamp = ctx.at.toISOString();
        const category: ExpenseCategory = {
          id: newId(),
          workspaceId: workspace.id,
          name: validName,
          archived: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        await repos.expenseCategories.put(category);
        await repos.audit.append(
          auditEvent(
            ctx,
            workspace,
            { type: 'expense-category', id: category.id },
            'expense.category-created',
            `Expense category ${validName} created`,
          ),
        );
        return category;
      });
    },

    async updateExpenseCategory(id: string, input: ExpenseCategoryInput): Promise<ExpenseCategory> {
      const ctx = context();
      return store.write(async (repos) => {
        const workspace = await requireWorkspace(repos);
        const current = await repos.expenseCategories.get(id);
        if (!current) throw new NotFoundError('Expense category not found.');
        const name = await validateCategoryName(repos, input.name, id);
        const next = { ...current, name, archived: input.archived };
        const changes = diffFields(current, next, ['name', 'archived']);
        if (changes.length === 0) return current;
        const saved = { ...next, updatedAt: ctx.at.toISOString() };
        await repos.expenseCategories.put(saved);
        await repos.audit.append(
          auditEvent(
            ctx,
            workspace,
            { type: 'expense-category', id },
            'expense.category-updated',
            `Expense category ${name} updated`,
            changes,
          ),
        );
        return saved;
      });
    },

    async listExpenses(): Promise<ExpenseRow[]> {
      return store.read(async (repos) => {
        const assets = await assetRefs(repos);
        const categories = new Map(
          (await repos.expenseCategories.list()).map((c) => [c.id, c.name]),
        );
        return (await repos.expenses.list()).sort(byExpenseDateDesc).map((expense) => ({
          expense,
          categoryName: categories.get(expense.categoryId) ?? 'Unknown category',
          asset: expense.assetId === null ? null : (assets.get(expense.assetId) ?? null),
        }));
      });
    },

    async getExpense(id: string): Promise<ExpenseDetail> {
      return store.read(async (repos) => {
        const expense = await requireExpense(repos, id);
        return {
          expense,
          categoryName: await categoryName(repos, expense.categoryId),
          asset: await refFor(repos, expense.assetId),
          history: await repos.audit.listForEntity('expense', id),
        };
      });
    },

    async recordExpense(input: ExpenseInput): Promise<Expense> {
      const ctx = context();
      return store.write(async (repos) =>
        insertExpense(repos, ctx, await requireWorkspace(repos), input),
      );
    },

    /** Corrects an expense, including its classification. Every changed field is audited. */
    async updateExpense(id: string, input: ExpenseInput): Promise<Expense> {
      const ctx = context();
      return store.write(async (repos) => {
        const workspace = await requireWorkspace(repos);
        const current = await requireExpense(repos, id);
        if (current.void) throw new AlreadyVoidedError('expense');
        const { details, asset, category } = await validate(
          repos,
          workspace,
          input,
          ctx.at,
          current,
        );
        const next: Expense = { ...current, ...details };
        const before = auditView(
          current,
          await refFor(repos, current.assetId),
          await categoryName(repos, current.categoryId),
        );
        const after = auditView(next, asset, category.name);
        const changes = diffFields(before, after, Object.keys(before) as (keyof typeof before)[]);
        if (changes.length === 0) return current;
        const saved = { ...next, updatedAt: ctx.at.toISOString() };
        await repos.expenses.put(saved);
        await repos.audit.append(
          auditEvent(
            ctx,
            workspace,
            { type: 'expense', id },
            'expense.updated',
            `Expense corrected: ${describe(saved, asset, category.name)}`,
            changes,
          ),
        );
        return saved;
      });
    },

    /** Removes an expense from every total. The record and its reason stay; this is permanent. */
    async voidExpense(id: string, reason: string): Promise<Expense> {
      const ctx = context();
      const info = voidInfo(reason, ctx.at);
      return store.write(async (repos) => {
        const workspace = await requireWorkspace(repos);
        const current = await requireExpense(repos, id);
        if (current.void) throw new AlreadyVoidedError('expense');
        const saved: Expense = { ...current, void: info, updatedAt: info.voidedAt };
        await repos.expenses.put(saved);
        const label = describe(
          current,
          await refFor(repos, current.assetId),
          await categoryName(repos, current.categoryId),
        );
        await repos.audit.append(
          auditEvent(
            ctx,
            workspace,
            { type: 'expense', id },
            'expense.voided',
            `Expense voided: ${label}. Reason: ${info.reason}`,
            [{ field: 'void', before: null, after: info.reason }],
          ),
        );
        return saved;
      });
    },
  };
}

export type ExpenseService = ReturnType<typeof createExpenseService>;
