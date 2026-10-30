import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StorageRepository } from '@/persistence/repository';
import fs from 'fs';
import path from 'path';

describe('StorageRepository & Domain Schemas (TASK-03)', () => {
  // Unique per run: a fixed name loses a race against the closing file handle on Windows.
  const testDbPath = path.resolve(
    process.cwd(),
    `test_storage_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
  );
  const OWNER = 'owner-1';
  const OTHER = 'owner-2';
  let repo: StorageRepository;

  beforeEach(async () => {
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
    repo = new StorageRepository(testDbPath);
    // vehicles.user_id is a foreign key, so the tenants have to exist first.
    await repo.findOrCreateUser({ id: OWNER, email: 'owner@example.com', name: 'Owner' });
    await repo.findOrCreateUser({ id: OTHER, email: 'other@example.com', name: 'Other' });
  });

  afterEach(async () => {
    if (repo) {
      await repo.close();
    }
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  });

  it('strictly validates schema rules and creates a vehicle', async () => {
    const vehicle = await repo.createVehicle({
      name: 'My Daily Car',
      make: 'Toyota',
      model: 'Corolla',
      year: 2022,
      licensePlate: 'س ق ر 123',
      initialOdometer: 50000,
      currentOdometer: 50000,
      recommendedOil: '5W-30',
    }, OWNER);

    expect(vehicle.id).toBeDefined();
    expect(vehicle.make).toBe('Toyota');
    expect(vehicle.currentOdometer).toBe(50000);

    const fetched = await repo.getVehicleById(vehicle.id!, OWNER);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe('My Daily Car');
    expect(fetched?.licensePlate).toBe('س ق ر 123'); // Arabic license plate integrity

    // Another tenant, and an anonymous caller, both see nothing.
    expect(await repo.getVehicleById(vehicle.id!, OTHER)).toBeNull();
    expect(await repo.getVehicleById(vehicle.id!)).toBeNull();
    expect(await repo.getAllVehicles()).toEqual([]);
  });

  it('rejects invalid domain data via Zod validation', async () => {
    await expect(
      repo.createVehicle({
        name: '', // Empty name should fail
        make: 'Honda',
        model: 'Civic',
        year: 2021,
        initialOdometer: -100, // Negative odometer should fail
        currentOdometer: -100,
      } as any)
    ).rejects.toThrow();
  });

  it('atomically logs fuel fill-up and advances vehicle odometer via ACID transaction', async () => {
    const vehicle = await repo.createVehicle({
      name: 'Family SUV',
      make: 'Hyundai',
      model: 'Tucson',
      year: 2023,
      initialOdometer: 10000,
      currentOdometer: 10000,
    }, OWNER);

    const fuelLog = await repo.addFuelLog({
      vehicleId: vehicle.id!,
      fillDate: '2026-10-28',
      odometer: 10550,
      liters: 45,
      pricePerLiter: 15.5,
      totalCost: 697.5,
      isFullTank: true,
      notes: 'Total station 95 Octane',
    });

    expect(fuelLog.id).toBeDefined();

    // Verify vehicle current odometer was automatically and atomically updated
    const updatedVehicle = await repo.getVehicleById(vehicle.id!, OWNER);
    expect(updatedVehicle?.currentOdometer).toBe(10550);

    const logs = await repo.getFuelLogsByVehicle(vehicle.id!);
    expect(logs.length).toBe(1);
    expect(logs[0].odometer).toBe(10550);
  });

  it('atomically logs maintenance service and advances vehicle odometer', async () => {
    const vehicle = await repo.createVehicle({
      name: 'Sedan',
      make: 'Nissan',
      model: 'Sunny',
      year: 2020,
      initialOdometer: 80000,
      currentOdometer: 80000,
    }, OWNER);

    const maintenanceLog = await repo.addMaintenanceLog({
      vehicleId: vehicle.id!,
      serviceDate: '2026-10-28',
      odometer: 82000,
      serviceType: 'oil_change',
      title: 'تغيير زيت المحرك وفلتر الزيت',
      partsCost: 1200,
      laborCost: 150,
      totalCost: 1350,
      workshop: 'الورشة الهندسية',
      notes: 'زيت تخليقي بالكامل 10,000 كم',
      nextDueOdometer: 92000,
      nextDueDate: '2027-04-28',
    });

    expect(maintenanceLog.id).toBeDefined();

    const updatedVehicle = await repo.getVehicleById(vehicle.id!, OWNER);
    expect(updatedVehicle?.currentOdometer).toBe(82000);

    const logs = await repo.getMaintenanceLogsByVehicle(vehicle.id!);
    expect(logs.length).toBe(1);
    expect(logs[0].title).toBe('تغيير زيت المحرك وفلتر الزيت');
  });

  it('persists and retrieves app settings correctly', async () => {
    await repo.setSetting('ai_provider', 'gemini');
    const val = await repo.getSetting('ai_provider');
    expect(val).toBe('gemini');

    // Update existing setting
    await repo.setSetting('ai_provider', 'openrouter');
    const updatedVal = await repo.getSetting('ai_provider');
    expect(updatedVal).toBe('openrouter');
  });

  it('updates maintenance schedule baseline odometer and date correctly', async () => {
    const vehicle = await repo.createVehicle({
      name: 'SUV',
      make: 'Hyundai',
      model: 'Tucson',
      year: 2021,
      initialOdometer: 60000,
      currentOdometer: 60000,
    }, OWNER);

    const schedule = await repo.addMaintenanceSchedule({
      vehicleId: vehicle.id!,
      itemCode: 'spark_plugs',
      titleAr: 'تغيير شمعات الاحتراق (البوجيهات)',
      titleEn: 'Spark Plugs Replacement',
      intervalKm: 40000,
      intervalMonths: 24,
      lastDoneOdometer: 60000,
      lastDoneDate: '2026-01-01',
    });

    expect(schedule.id).toBeDefined();

    // User specifies custom baseline: spark plugs were actually changed at 50,000 km
    await repo.updateMaintenanceSchedule(schedule.id!, {
      lastDoneOdometer: 50000,
      lastDoneDate: '2025-06-15',
      intervalKm: 35000,
    });

    const updated = await repo.getSchedulesByVehicle(vehicle.id!);
    expect(updated.length).toBe(1);
    expect(updated[0].lastDoneOdometer).toBe(50000);
    expect(updated[0].lastDoneDate).toBe('2025-06-15');
    expect(updated[0].intervalKm).toBe(35000);
  });

  it('resolves the owning user for a record and refuses unknown or unassigned rows', async () => {
    const vehicle = await repo.createVehicle({
      name: 'Owner Probe',
      make: 'Toyota',
      model: 'Corolla',
      year: 2022,
      initialOdometer: 1000,
      currentOdometer: 1000,
    }, OWNER);

    const fuel = await repo.addFuelLog({
      vehicleId: vehicle.id!,
      fillDate: '2026-10-01',
      odometer: 1200,
      liters: 30,
      pricePerLiter: 15,
      totalCost: 450,
      isFullTank: true,
    });
    const maint = await repo.addMaintenanceLog({
      vehicleId: vehicle.id!,
      serviceDate: '2026-10-02',
      odometer: 1300,
      serviceType: 'oil_change',
      title: 'زيت',
      partsCost: 0,
      laborCost: 0,
      totalCost: 100,
    });
    const schedule = await repo.addMaintenanceSchedule({
      vehicleId: vehicle.id!,
      itemCode: 'engine_oil',
      titleAr: 'زيت',
      titleEn: 'Oil',
      intervalKm: 10000,
      lastDoneOdometer: 1000,
      lastDoneDate: '2026-01-01',
    });

    // The primitive the write routes authorize with: child rows inherit the vehicle owner.
    expect(await repo.ownerOf('vehicles', vehicle.id!)).toBe(OWNER);
    expect(await repo.ownerOf('fuel_logs', fuel.id!)).toBe(OWNER);
    expect(await repo.ownerOf('maintenance_logs', maint.id!)).toBe(OWNER);
    expect(await repo.ownerOf('maintenance_schedules', schedule.id!)).toBe(OWNER);

    expect(await repo.ownerOf('fuel_logs', 'missing-row')).toBeNull();
    expect(await repo.ownerOf('fuel_logs', '')).toBeNull();

    // A row created without an owner is nobody's: it must not become a public row.
    const orphan = await repo.createVehicle({
      name: 'Orphan',
      make: 'Toyota',
      model: 'Corolla',
      year: 2022,
      initialOdometer: 0,
      currentOdometer: 0,
    });
    expect(await repo.ownerOf('vehicles', orphan.id!)).toBeNull();
  });
});
