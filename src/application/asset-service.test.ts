import { describe, expect, it } from 'vitest';
import { LOCAL_ACTOR } from '@/domain/audit';
import { parseMoney, toDecimalString } from '@/domain/money';
import { MemoryWorkspaceStore } from '@/persistence/memory/memory-workspace-store';
import { sequentialIds, steppingClock } from '@/test/fixtures';
import type { AssetInput } from './asset-records';
import { AssetValidationError } from './asset-records';
import { RevisionRejectedError, createAssetService } from './asset-service';
import { createDepreciationService } from './depreciation-service';
import { createWorkspaceService } from './workspace-service';

const ghs = (amount: string) => parseMoney(amount, 'GHS');

async function setup() {
  const store = new MemoryWorkspaceStore();
  // "Today" is mid-June 2026 in Accra.
  const deps = {
    store,
    newId: sequentialIds(),
    now: steppingClock('2026-06-15T09:00:00.000Z'),
    actor: LOCAL_ACTOR,
  };
  const workspace = createWorkspaceService(deps);
  const assets = createAssetService(deps);
  const depreciation = createDepreciationService(deps);
  await workspace.createWorkspace('Fleet');
  const categories = await assets.listCategories();
  const car = categories.find((c) => c.name === 'Car');
  const equipment = categories.find((c) => c.name === 'Equipment');
  if (!car || !equipment) throw new Error('default categories missing');
  return { store, workspace, assets, depreciation, car, equipment };
}

function carInput(categoryId: string, overrides: Partial<AssetInput['details']> = {}): AssetInput {
  return {
    details: {
      code: 'GR-001',
      name: 'Toyota Corolla',
      categoryId,
      description: '',
      acquisitionDate: '2026-01-10',
      location: 'Accra',
      supplier: '',
      notes: '',
      vehicle: {
        make: 'Toyota',
        model: 'Corolla',
        year: 2022,
        registration: 'GR 1234-22',
        vin: '',
      },
      ...overrides,
    },
    depreciation: {
      method: 'straight-line',
      capitalizedCost: ghs('12000.00'),
      residualValue: ghs('0.00'),
      usefulLifeMonths: 12,
      inServiceDate: '2026-01-15',
    },
  };
}

describe('asset creation', () => {
  it('creates an asset with a version-1 schedule, normalised optional fields and an audit event', async () => {
    const { assets, car } = await setup();
    const asset = await assets.createAsset(carInput(car.id));
    expect(asset).toMatchObject({ status: 'active', description: null, supplier: null });
    expect(asset.vehicle?.vin).toBeNull();

    const detail = await assets.getAsset(asset.id);
    expect(detail.schedules).toHaveLength(1);
    expect(detail.lines).toHaveLength(12);
    expect(detail.lines[0]?.charge).toEqual(ghs('1000.00'));
    expect(detail.currentPeriod).toBe('2026-06');
    // Jan–Jun charged by the end of June.
    expect(detail.position.accumulated).toEqual(ghs('6000.00'));
    expect(detail.position.bookValue).toEqual(ghs('6000.00'));
    expect(detail.history[0]?.action).toBe('asset.created');
  });

  it('never records acquisition cost as anything other than the capitalised cost', async () => {
    const { assets, car } = await setup();
    const asset = await assets.createAsset(carInput(car.id));
    const detail = await assets.getAsset(asset.id);
    const totalDepreciation = detail.lines.reduce((t, l) => t + l.charge.amountMinor, 0);
    expect(totalDepreciation).toBe(ghs('12000.00').amountMinor);
  });

  it('rejects a duplicate asset code regardless of case or spacing', async () => {
    const { assets, car } = await setup();
    await assets.createAsset(carInput(car.id));
    await expect(assets.createAsset(carInput(car.id, { code: '  gr-001 ' }))).rejects.toThrow(
      /already used/,
    );
  });

  it('drops vehicle fields for non-vehicle categories', async () => {
    const { assets, equipment } = await setup();
    const asset = await assets.createAsset(
      carInput(equipment.id, { code: 'GEN-1', name: 'Generator' }),
    );
    expect(asset.vehicle).toBeNull();
  });

  it('rejects an archived category for new assets', async () => {
    const { assets, car } = await setup();
    await assets.updateCategory(car.id, {
      name: car.name,
      usesVehicleFields: true,
      archived: true,
    });
    await expect(assets.createAsset(carInput(car.id))).rejects.toThrow(/archived/);
  });

  it.each([
    [
      'in-service before acquisition',
      { acquisitionDate: '2026-02-01' },
      /before the acquisition date/,
    ],
    ['missing name', { name: '  ' }, /Enter an asset name/],
    ['bad code characters', { code: '#1' }, /letters, numbers/],
  ])('rejects %s without writing', async (_label, override, message) => {
    const { assets, car, store } = await setup();
    const before = await store.snapshot();
    await expect(assets.createAsset(carInput(car.id, override))).rejects.toThrow(message);
    expect(await store.snapshot()).toEqual(before);
  });

  it('rejects invalid depreciation assumptions', async () => {
    const { assets, car } = await setup();
    const input = carInput(car.id);
    await expect(
      assets.createAsset({
        ...input,
        depreciation: { ...input.depreciation, usefulLifeMonths: 0 },
      }),
    ).rejects.toBeInstanceOf(AssetValidationError);
    await expect(
      assets.createAsset({
        ...input,
        depreciation: { ...input.depreciation, residualValue: ghs('20000.00') },
      }),
    ).rejects.toThrow(/cannot exceed cost/);
  });
});

describe('editing details and status', () => {
  it('audits changed details only', async () => {
    const { assets, car } = await setup();
    const asset = await assets.createAsset(carInput(car.id));
    await assets.updateAssetDetails(asset.id, { ...carInput(car.id).details, location: 'Kumasi' });
    const detail = await assets.getAsset(asset.id);
    expect(detail.asset.location).toBe('Kumasi');
    expect(detail.history[0]).toMatchObject({
      action: 'asset.updated',
      changes: [{ field: 'location', before: 'Accra', after: 'Kumasi' }],
    });
  });

  it('archives without stopping depreciation, and can reactivate', async () => {
    const { assets, car, depreciation } = await setup();
    const asset = await assets.createAsset(carInput(car.id));
    await assets.setAssetStatus(asset.id, 'archived');
    expect((await depreciation.periodReport('2026-07')).rows).toHaveLength(1);
    const reactivated = await assets.setAssetStatus(asset.id, 'active');
    expect(reactivated.status).toBe('active');
    expect((await assets.getAsset(asset.id)).history.map((e) => e.action).slice(0, 2)).toEqual([
      'asset.reactivated',
      'asset.archived',
    ]);
  });
});

describe('depreciation revisions and period close', () => {
  it('replaces the whole schedule while no months are closed', async () => {
    const { assets, car } = await setup();
    const asset = await assets.createAsset(carInput(car.id));
    const next = { ...asset.depreciation, capitalizedCost: ghs('24000.00') };

    const preview = await assets.previewRevision(asset.id, next);
    expect(preview.ok && preview.fullReplacement).toBe(true);
    // Previewing writes nothing.
    expect((await assets.getAsset(asset.id)).schedules).toHaveLength(1);

    await assets.reviseDepreciation(asset.id, next, 'Invoice corrected');
    const detail = await assets.getAsset(asset.id);
    expect(detail.schedules.map((s) => s.version)).toEqual([1, 2]);
    expect(detail.lines).toHaveLength(12);
    expect(detail.lines.every((l) => l.scheduleId === detail.schedules[1]?.id)).toBe(true);
    expect(detail.lines[0]?.charge).toEqual(ghs('2000.00'));
    expect(detail.history[0]).toMatchObject({ action: 'depreciation.revised' });
    expect(detail.history[0]?.changes).toContainEqual({
      field: 'capitalizedCost',
      before: 'GHS 12000.00',
      after: 'GHS 24000.00',
    });
  });

  it('keeps closed months exactly and revises only open months', async () => {
    const { assets, car, depreciation } = await setup();
    const asset = await assets.createAsset(carInput(car.id));
    const before = await assets.getAsset(asset.id);

    await depreciation.closePeriods('2026-03');
    await assets.reviseDepreciation(
      asset.id,
      { ...asset.depreciation, usefulLifeMonths: 6, residualValue: ghs('3000.00') },
      'Shorter expected life',
    );
    const after = await assets.getAsset(asset.id);

    expect(after.lines.slice(0, 3)).toEqual(before.lines.slice(0, 3));
    expect(after.lines.map((l) => l.period)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
    expect(after.lines.slice(3).map((l) => toDecimalString(l.charge))).toEqual([
      '2000.00',
      '2000.00',
      '2000.00',
    ]);
    expect(after.lines.at(-1)?.closingBookValue).toEqual(ghs('3000.00'));
    // Superseded projections stay stored for history.
    expect(after.schedules).toHaveLength(2);
  });

  it('blocks cost changes after months are closed', async () => {
    const { assets, car, depreciation } = await setup();
    const asset = await assets.createAsset(carInput(car.id));
    await depreciation.closePeriods('2026-02');
    await expect(
      assets.reviseDepreciation(
        asset.id,
        { ...asset.depreciation, capitalizedCost: ghs('13000.00') },
        'Typo',
      ),
    ).rejects.toBeInstanceOf(RevisionRejectedError);
  });

  it('requires a reason and a real change', async () => {
    const { assets, car } = await setup();
    const asset = await assets.createAsset(carInput(car.id));
    await expect(
      assets.reviseDepreciation(asset.id, { ...asset.depreciation, usefulLifeMonths: 24 }, ' '),
    ).rejects.toThrow(/reason/);
    await expect(assets.reviseDepreciation(asset.id, asset.depreciation, 'No-op')).rejects.toThrow(
      /unchanged/,
    );
  });

  it('only closes months that have ended, moving forward', async () => {
    const { depreciation, workspace } = await setup();
    await expect(depreciation.closePeriods('2026-06')).rejects.toThrow(/ended/);
    await depreciation.closePeriods('2026-04');
    await expect(depreciation.closePeriods('2026-03')).rejects.toThrow(/already closed/);
    expect((await workspace.getWorkspace())?.depreciationClosedThrough).toBe('2026-04');
    const [latest] = (await workspace.listAuditEvents({ offset: 0, limit: 1 })).items;
    expect(latest?.action).toBe('depreciation.periods-closed');
  });

  it('reports one month across assets using the governing schedule version only', async () => {
    const { assets, car, depreciation } = await setup();
    const a = await assets.createAsset(carInput(car.id));
    await assets.createAsset(carInput(car.id, { code: 'GR-002' }));
    await depreciation.closePeriods('2026-03');
    await assets.reviseDepreciation(
      a.id,
      { ...a.depreciation, usefulLifeMonths: 6 },
      'Shorter life',
    );

    const march = await depreciation.periodReport('2026-03');
    expect(march.closed).toBe(true);
    expect(toDecimalString(march.totalCharge)).toBe('2000.00');

    const april = await depreciation.periodReport('2026-04');
    expect(april.closed).toBe(false);
    expect(april.rows.map((r) => toDecimalString(r.line.charge))).toEqual(['3000.00', '1000.00']);
    expect(toDecimalString(april.totalCharge)).toBe('4000.00');

    expect((await depreciation.periodReport('2025-12')).rows).toEqual([]);
  });
});

describe('categories', () => {
  it('creates unique categories and audits changes', async () => {
    const { assets } = await setup();
    const trailer = await assets.createCategory({ name: 'Trailer', usesVehicleFields: true });
    await expect(
      assets.createCategory({ name: 'trailer', usesVehicleFields: false }),
    ).rejects.toThrow(/already exists/);
    const renamed = await assets.updateCategory(trailer.id, {
      name: 'Trailers',
      usesVehicleFields: true,
      archived: false,
    });
    expect(renamed.name).toBe('Trailers');
  });
});

describe('demo workspace', () => {
  it('seeds fictional assets with schedules', async () => {
    const store = new MemoryWorkspaceStore();
    const deps = {
      store,
      newId: sequentialIds(),
      now: steppingClock('2026-06-15T09:00:00.000Z'),
      actor: LOCAL_ACTOR,
    };
    await createWorkspaceService(deps).createDemoWorkspace();
    const { items } = await createAssetService(deps).listAssets();
    expect(items.map((i) => i.asset.code)).toEqual(['DEMO-001', 'DEMO-002', 'DEMO-003']);
    expect(items.every((i) => i.position.state === 'depreciating')).toBe(true);
  });
});
