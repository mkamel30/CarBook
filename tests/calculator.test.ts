import { describe, it, expect, vi } from 'vitest';
import { calculateFuelConsumption, evaluateMaintenanceStatus } from '@/services/calculator';
import { lookupVehicleScheduleProposal } from '@/services/ai';
import { FuelLog, MaintenanceSchedule } from '@/domain/schemas';

describe('Calculator & Business Logic Engine (TASK-04)', () => {
  it('correctly calculates fuel consumption and cost metrics between two full tank fills', () => {
    const prevLog: FuelLog = {
      id: '1',
      vehicleId: 'v1',
      fillDate: '2026-10-01',
      odometer: 50000,
      liters: 40,
      pricePerLiter: 15,
      totalCost: 600,
      isFullTank: true,
    };

    const currentLog: FuelLog = {
      id: '2',
      vehicleId: 'v1',
      fillDate: '2026-10-10',
      odometer: 50500,
      liters: 35,
      pricePerLiter: 15,
      totalCost: 525,
      isFullTank: true,
    };

    const result = calculateFuelConsumption(prevLog, currentLog);
    expect(result).not.toBeNull();
    expect(result?.distanceTraveledKm).toBe(500);
    expect(result?.litersUsed).toBe(35);
    // (35 / 500) * 100 = 7.0 L/100km
    expect(result?.litersPer100Km).toBe(7.0);
    // 500 / 35 = 14.29 km/L
    expect(result?.kmPerLiter).toBe(14.29);
    // 525 / 500 = 1.05 / km
    expect(result?.costPerKm).toBe(1.05);
  });

  it('evaluates maintenance alert status as ok, due_soon, or overdue', () => {
    const schedule: MaintenanceSchedule = {
      id: 's1',
      vehicleId: 'v1',
      itemCode: 'oil',
      titleAr: 'تغيير الزيت',
      titleEn: 'Oil Change',
      intervalKm: 10000,
      lastDoneOdometer: 50000,
      lastDoneDate: '2026-05-01',
      intervalMonths: 6,
    };

    // Current odometer 55,000 -> 5,000 km left -> Status: 'ok'
    const statusOk = evaluateMaintenanceStatus(schedule, 55000, new Date('2026-08-01'));
    expect(statusOk.status).toBe('ok');
    expect(statusOk.remainingKm).toBe(5000);

    // Current odometer 59,500 -> 500 km left -> Status: 'due_soon'
    const statusDueSoon = evaluateMaintenanceStatus(schedule, 59500, new Date('2026-08-01'));
    expect(statusDueSoon.status).toBe('due_soon');
    expect(statusDueSoon.remainingKm).toBe(500);

    // Current odometer 60,200 -> -200 km left -> Status: 'overdue'
    const statusOverdue = evaluateMaintenanceStatus(schedule, 60200, new Date('2026-08-01'));
    expect(statusOverdue.status).toBe('overdue');
    expect(statusOverdue.remainingKm).toBe(-200);
    expect(statusOverdue.alertMessageAr).toContain('تجاوز موعد الصيانة');
  });

  it('implements bounded retry (max 3) and schema validation for AI schedule lookup', async () => {
    let mockCalls = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      mockCalls++;
      if (mockCalls < 2) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  recommendedOil: '5W-30 Synthetic',
                  maintenanceItems: [
                    {
                      itemCode: 'oil_filter',
                      titleAr: 'تغيير الزيت والفلتر',
                      titleEn: 'Oil and Filter',
                      intervalKm: 10000,
                      intervalMonths: 6,
                    },
                  ],
                }),
              },
            },
          ],
        }),
      };
    });

    const proposal = await lookupVehicleScheduleProposal(
      'Toyota',
      'Corolla',
      2022,
      { apiKey: 'test-key', provider: 'openrouter' },
      mockFetch as any
    );

    expect(mockCalls).toBe(2);
    expect(proposal.recommendedOil).toBe('5W-30 Synthetic');
    expect(proposal.maintenanceItems.length).toBe(1);
    expect(proposal.maintenanceItems[0].intervalKm).toBe(10000);
  });

  it('rejects SSRF attempts with non-HTTPS or loopback endpoints', async () => {
    await expect(
      lookupVehicleScheduleProposal(
        'Toyota',
        'Corolla',
        2022,
        {
          apiKey: 'test-key',
          provider: 'openrouter',
          customEndpoint: 'http://localhost:8080/malicious',
        }
      )
    ).rejects.toThrow();
  });
});
