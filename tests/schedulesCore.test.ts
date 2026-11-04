import { describe, it, expect } from 'vitest';
import {
  computeMaxOdometer,
  dedupeItemCodes,
  evaluateSchedulesForRead,
  planScheduleLinking,
} from '@/domain/schedulesCore';
import type { MaintenanceSchedule } from '@/domain/schemas';

// Unit coverage for the domain core the server and the device share
// (domain/schedulesConformance.ts proves both adapters honour it end-to-end).

const sched = (over: Partial<MaintenanceSchedule> = {}): MaintenanceSchedule => ({
  id: 's1',
  vehicleId: 'v1',
  itemCode: 'engine_oil_filter',
  titleAr: 'زيت',
  titleEn: 'Engine oil',
  intervalKm: 10000,
  intervalMonths: 6,
  lastDoneOdometer: null,
  lastDoneDate: null,
  ...over,
});

const log = (odometer: number, serviceDate: string, serviceType = 'oil_change') => ({
  id: `l${odometer}`,
  vehicleId: 'v1',
  odometer,
  serviceDate,
  serviceType,
});

describe('planScheduleLinking', () => {
  it('changes nothing when no item is in scope', () => {
    expect(planScheduleLinking([sched()], [log(15000, '2026-05-01')], { itemCodes: [] })).toEqual([]);
    expect(planScheduleLinking([sched()], [log(15000, '2026-05-01')], { itemCodes: [null, ''] })).toEqual([]);
  });

  it('ignores rows outside the requested item codes', () => {
    const patches = planScheduleLinking(
      [sched({ itemCode: 'brake_pads' })],
      [log(15000, '2026-05-01')],
      { itemCodes: ['engine_oil_filter'] },
    );
    expect(patches).toEqual([]);
  });

  it('takes the newest evidencing log, not the last one written', () => {
    const patches = planScheduleLinking(
      [sched()],
      [log(12000, '2026-01-01'), log(15000, '2026-05-01'), log(13000, '2026-03-01')],
      { itemCodes: ['engine_oil_filter'] },
    );
    expect(patches).toHaveLength(1);
    expect(patches[0].lastDoneOdometer).toBe(15000);
    expect(patches[0].lastDoneDate).toBe('2026-05-01');
  });

  it('returns the row it was given, so the adapter can write it back', () => {
    const row = sched();
    const [patch] = planScheduleLinking([row], [log(15000, '2026-05-01')], { itemCodes: ['engine_oil_filter'] });
    expect(patch.schedule).toBe(row);
  });

  it('never rewinds a baseline and never clears one', () => {
    const current = sched({ lastDoneOdometer: 15000, lastDoneDate: '2026-05-01' });
    expect(planScheduleLinking([current], [log(12000, '2026-01-01')], { itemCodes: ['engine_oil_filter'] })).toEqual([]);
    expect(planScheduleLinking([current], [], { itemCodes: ['engine_oil_filter'] })).toEqual([]);
  });

  it('fills in only a missing date when the odometer is equal', () => {
    const odoOnly = sched({ lastDoneOdometer: 15000, lastDoneDate: null });
    const patches = planScheduleLinking([odoOnly], [log(15000, '2026-05-01')], { itemCodes: ['engine_oil_filter'] });
    expect(patches).toHaveLength(1);
    expect(patches[0].lastDoneDate).toBe('2026-05-01');
  });

  it('uses the just-written log for the explicitly picked item', () => {
    const patches = planScheduleLinking(
      [sched({ itemCode: 'brake_pads' })],
      [], // no log evidences brake pads yet — only the explicit choice can link it
      {
        itemCodes: ['brake_pads'],
        explicitItemCode: 'brake_pads',
        sourceLog: { odometer: 15000, serviceDate: '2026-05-01' },
      },
    );
    expect(patches).toHaveLength(1);
    expect(patches[0].lastDoneOdometer).toBe(15000);
  });

  it('falls back to the evidencing logs for the other items of the same write', () => {
    const patches = planScheduleLinking(
      [sched(), sched({ id: 's2', itemCode: 'brake_pads' })],
      [log(15000, '2026-05-01'), log(9000, '2026-01-01', 'brakes')],
      {
        itemCodes: ['engine_oil_filter', 'brake_pads'],
        explicitItemCode: 'engine_oil_filter',
        sourceLog: { odometer: 17000, serviceDate: '2026-08-01' },
      },
    );
    expect(patches.map((p) => [p.schedule.itemCode, p.lastDoneOdometer])).toEqual([
      ['engine_oil_filter', 17000],
      ['brake_pads', 9000],
    ]);
  });

  it('does not let the explicit source log drive an unrelated item', () => {
    const patches = planScheduleLinking(
      [sched({ itemCode: 'brake_pads' })],
      [],
      { itemCodes: ['brake_pads'], explicitItemCode: 'engine_oil_filter', sourceLog: { odometer: 15000, serviceDate: '2026-05-01' } },
    );
    expect(patches).toEqual([]);
  });
});

describe('evaluateSchedulesForRead', () => {
  const logs = [log(15000, '2026-05-01')];

  it('marks an unserviced item as needing a record, with no km invented', () => {
    const [row] = evaluateSchedulesForRead([sched()], logs, 20000);
    expect(row.status).toBe('needs_record');
    expect(row.remainingKm).toBeNull();
    expect(row.linkedFromLog).toBeUndefined();
  });

  it('attaches linkedFromLog only when a live log carries that exact baseline', () => {
    const [linked] = evaluateSchedulesForRead(
      [sched({ lastDoneOdometer: 15000, lastDoneDate: '2026-05-01' })],
      logs,
      20000,
    );
    expect(linked.linkedFromLog).toEqual({ date: '2026-05-01', odo: 15000 });

    const [handEntered] = evaluateSchedulesForRead(
      [sched({ lastDoneOdometer: 14000, lastDoneDate: '2026-05-01' })],
      logs,
      20000,
    );
    expect('linkedFromLog' in handEntered).toBe(false);
  });

  it('computes the remaining distance from the baseline and the interval', () => {
    const [row] = evaluateSchedulesForRead(
      [sched({ lastDoneOdometer: 15000 })],
      logs,
      21000,
      new Date('2026-06-01T00:00:00Z'),
    );
    expect(row.remainingKm).toBe(4000);
    expect(row.status).not.toBe('needs_record');
  });
});

describe('computeMaxOdometer', () => {
  it('rises to the highest reading the car has reported', () => {
    expect(computeMaxOdometer(10000, [15000, 12000])).toBe(15000);
    expect(computeMaxOdometer(10000, [])).toBe(10000);
    expect(computeMaxOdometer(30000, [15000])).toBe(30000);
  });

  it('treats a missing or corrupt reading as 0, never as a max', () => {
    expect(computeMaxOdometer(null, [undefined, NaN, 'abc', 12000])).toBe(12000);
    expect(computeMaxOdometer(undefined, [])).toBe(0);
  });
});

describe('dedupeItemCodes', () => {
  it('drops blanks and repeats while keeping catalogue order', () => {
    expect(dedupeItemCodes(['engine_oil_filter', 'air_filter', 'engine_oil_filter', '', null, undefined])).toEqual([
      'engine_oil_filter',
      'air_filter',
    ]);
  });
});
