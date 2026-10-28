import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StorageRepository } from '@/persistence/repository';
import fs from 'fs';
import path from 'path';

describe('StorageRepository & Domain Schemas (TASK-03)', () => {
  const testDbPath = path.resolve(process.cwd(), 'test_car_maintenance.db');
  let repo: StorageRepository;

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
    repo = new StorageRepository(testDbPath);
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
    });

    expect(vehicle.id).toBeDefined();
    expect(vehicle.make).toBe('Toyota');
    expect(vehicle.currentOdometer).toBe(50000);

    const fetched = await repo.getVehicleById(vehicle.id!);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe('My Daily Car');
    expect(fetched?.licensePlate).toBe('س ق ر 123'); // Arabic license plate integrity
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
    });

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
    const updatedVehicle = await repo.getVehicleById(vehicle.id!);
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
    });

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

    const updatedVehicle = await repo.getVehicleById(vehicle.id!);
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
});
