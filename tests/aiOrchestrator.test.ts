import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StorageRepository } from '@/persistence/repository';
import {
  getOrFetchVehicleManual,
  getOrFetchVehicleSchedules,
  consultAiDoctor,
} from '@/services/aiOrchestrator';
import { findPreseededVehicle, generateHeuristicSpecs } from '@/services/automotiveDatabase';
import fs from 'fs';
import path from 'path';

describe('Server-Side Managed AI & 4-Tier Hybrid Engine', () => {
  const testDbPath = path.resolve(process.cwd(), 'test_ai_orchestrator.db');
  let repo: StorageRepository;

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
    repo = new StorageRepository(testDbPath);
  });

  afterEach(async () => {
    await repo.close();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  });

  it('retrieves verified OEM specs from preseeded database without API key and caches in SQLite', async () => {
    const preseeded = findPreseededVehicle('Toyota', 'Corolla', 2021);
    expect(preseeded).not.toBeNull();
    expect(preseeded?.specs.engineOilViscosity).toContain('0W-20');

    // First call: populates cache from preseeded
    const res1 = await getOrFetchVehicleManual('Toyota', 'Corolla', 2021, repo);
    expect(res1.specs.engineOilViscosity).toContain('0W-20');
    expect(res1.source).toBe('preseeded_oem');

    // Second call: directly served from SQLite cache
    const res2 = await getOrFetchVehicleManual('Toyota', 'Corolla', 2021, repo);
    expect(res2.fromCache).toBe(true);
    expect(res2.specs.engineOilCapacityLiters).toBe(res1.specs.engineOilCapacityLiters);
  });

  it('generates safe automotive heuristic specs for unknown car models when offline/no key', async () => {
    const specs = generateHeuristicSpecs('Peugeot', '3008', 2022);
    expect(specs.engineOilViscosity).toContain('0W-20');
    expect(specs.coolantType).toBeDefined();

    const res = await getOrFetchVehicleManual('Peugeot', '3008', 2022, repo);
    expect(res.specs.brakeFluidType).toBe('DOT 4 معتمد ومقاوم للغليان');
    expect(res.source).toBe('automotive_heuristic');
  });

  it('retrieves maintenance schedules and caches them', async () => {
    const res = await getOrFetchVehicleSchedules('Hyundai', 'Elantra', 2022, repo);
    expect(res.proposal.maintenanceItems.length).toBeGreaterThan(0);
    expect(res.proposal.recommendedOil).toContain('5W-30');

    // Verify it was cached in SQLite
    const cached = await repo.getGlobalSpecCache('Hyundai', 'Elantra', 2022);
    expect(cached).not.toBeNull();
    expect(cached?.schedules?.recommendedOil).toContain('5W-30');
  });

  it('provides diagnostic advice through the Car Doctor engine', async () => {
    const vehicle = {
      make: 'Nissan',
      model: 'Sunny',
      year: 2020,
      currentOdometer: 45000,
    };

    const result = await consultAiDoctor(
      vehicle,
      'عندي تصفير قوي في الفرامل مع الضغط',
      [],
      repo
    );

    expect(result.advice).toContain('تيل الفرامل');
    expect(result.advice).toContain('طنابير');
    expect(result.source).toBeDefined();
  });
});
