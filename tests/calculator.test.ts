import { describe, it, expect, vi } from 'vitest';
import { calculateFuelConsumption, enrichFuelMetrics, evaluateMaintenanceStatus } from '@/services/calculator';
import { lookupVehicleScheduleProposal, lookupFullVehicleManual, askAiCarDoctor } from '@/services/ai';
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

  it('omits consumption for partial fills and keeps the full-tank chain intact', () => {
    const log = (
      id: string,
      fillDate: string,
      odometer: number,
      liters: number,
      isFullTank: boolean
    ): FuelLog => ({
      id,
      vehicleId: 'v1',
      fillDate,
      odometer,
      liters,
      pricePerLiter: 15,
      totalCost: liters * 15,
      isFullTank,
    });

    // 50000 full -> 50200 partial -> 50500 full
    const enriched = enrichFuelMetrics([
      log('a', '2026-10-01', 50000, 40, true),
      log('b', '2026-10-05', 50200, 8, false),
      log('c', '2026-10-10', 50500, 35, true),
    ]);

    expect(enriched.map((e) => e.id)).toEqual(['a', 'b', 'c']);

    // A partial fill only covers part of the distance, so it reports nothing.
    expect(enriched[1].litersPer100Km).toBeNull();
    expect(enriched[1].distanceTraveledKm).toBeNull();
    expect(enriched[1].costPerKm).toBeNull();

    // The next full tank closes the window and absorbs the partial top-up inside it:
    // 8 + 35 = 43 L over 500 km, not the 35 L bought on the last visit alone.
    expect(enriched[2].distanceTraveledKm).toBe(500);
    expect(enriched[2].litersPer100Km).toBe(8.6);
    expect(enriched[2].kmPerLiter).toBe(11.63);
    expect(enriched[2].costPerKm).toBe(1.29);

    // The first full tank has nothing to compare against.
    expect(enriched[0].litersPer100Km).toBeNull();
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

  it('fetches and validates complete vehicle OEM manual specifications', async () => {
    const mockManualSpecs = {
      engineOilViscosity: '0W-20 Full Synthetic',
      engineOilCapacityLiters: '4.2 لتر مع الفلتر',
      transmissionFluidType: 'Toyota CVT FE',
      coolantType: 'Super Long Life Coolant Pink',
      brakeFluidType: 'DOT 4',
      tirePressurePsiFront: '32 PSI',
      tirePressurePsiRear: '32 PSI',
      fuelTankCapacityLiters: '50 لتر',
      recommendedFuelOctane: '92 أو 95 أوكتان',
      sparkPlugType: 'Iridium ILKAR7B11',
      batterySpec: '12V 45Ah',
      generalNotesAr: 'تغيير زيت الفتيس كل 60,000 كم',
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: `Here is the data:\n\`\`\`json\n${JSON.stringify(mockManualSpecs)}\n\`\`\``,
            },
          },
        ],
      }),
    });

    const specs = await lookupFullVehicleManual(
      'Toyota',
      'Corolla',
      2022,
      { apiKey: 'test-key', provider: 'openrouter' },
      mockFetch as any
    );

    expect(specs.engineOilViscosity).toBe('0W-20 Full Synthetic');
    expect(specs.tirePressurePsiFront).toBe('32 PSI');
    expect(specs.fuelTankCapacityLiters).toBe('50 لتر');
  });

  it('consults AI Car Doctor grounded in vehicle history and odometer', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'صوت الطقطقة مع الملفات يرجع غالباً لتلف الكوبلن الخارجي (CV Joint). ينصح بفحصه فوراً.',
            },
          },
        ],
      }),
    });

    const advice = await askAiCarDoctor(
      {
        make: 'Toyota',
        model: 'Corolla',
        year: 2022,
        currentOdometer: 65000,
      },
      'في صوت طقطقة مع الملفات لليمين',
      [
        { serviceDate: '2026-01-10', title: 'تغيير زيت وفلتر', odometer: 60000 },
      ],
      { apiKey: 'test-key', provider: 'openrouter' },
      mockFetch as any
    );

    expect(advice).toContain('الكوبلن الخارجي');
  });
});
