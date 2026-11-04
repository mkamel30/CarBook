import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { StorageRepository } from '@/persistence/repository';
import { evaluateSchedulesForRead } from '@/domain/schedulesCore';
import {
  CUSTOM_ITEM_CODE_PREFIX,
  missingFactoryPresets,
} from '@/services/presets';
import { maintenanceScheduleSchema } from '@/domain/schemas';
import { authErrorResponse, requireOwnership, requireUser } from '@/services/authz';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get('vehicleId');
    if (!vehicleId) {
      return NextResponse.json({ success: false, error: 'vehicleId is required' }, { status: 400 });
    }

    const user = requireUser(req);
    const repo = new StorageRepository();
    const vehicle = await repo.getVehicleById(vehicleId, user.id);
    if (!vehicle) {
      return NextResponse.json({ success: false, error: 'Vehicle not found or unauthorized' }, { status: 404 });
    }

    // Idempotent per item_code: insert every factory preset this vehicle does not
    // have yet (including presets added by a later release). Rows the owner
    // removed stay removed, because the comparison includes tombstoned codes.
    // A seeded row carries NO baseline, so an item that was never serviced shows
    // "service record required" instead of a fabricated odometer/date reading.
    const existingCodes = await repo.getItemCodesByVehicle(vehicleId);
    const missing = missingFactoryPresets(existingCodes);
    for (const preset of missing) {
      await repo.addMaintenanceSchedule({
        vehicleId,
        itemCode: preset.itemCode,
        titleAr: preset.titleAr,
        titleEn: preset.titleEn,
        intervalKm: preset.intervalKm,
        intervalMonths: preset.intervalMonths,
        lastDoneOdometer: null,
        lastDoneDate: null,
      });
    }

    const schedules = await repo.getSchedulesByVehicle(vehicleId);
    const logs = await repo.getMaintenanceLogsByVehicle(vehicleId);

    return NextResponse.json({
      success: true,
      data: {
        vehicle,
        schedules: evaluateSchedulesForRead(schedules, logs, vehicle.currentOdometer),
      },
    });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/schedules — add a user-defined preventive item.
 *
 * No new columns: the row lives in maintenance_schedules like any factory item,
 * under a `custom_…` item_code so the UI can badge it and offer removal. Input is
 * validated by the shared domain schema, and the item starts with NO baseline
 * (service record required) exactly like a factory preset.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const user = requireUser(req);
    const repo = new StorageRepository();
    await requireOwnership(repo, 'vehicles', body?.vehicleId, user.id);

    const titleAr = typeof body?.titleAr === 'string' ? body.titleAr.trim() : '';
    const titleEnRaw = typeof body?.titleEn === 'string' ? body.titleEn.trim() : '';
    // The card is bilingual; when only one name is given, reuse it for both sides
    // rather than inventing a translation.
    const titleEn = titleEnRaw || titleAr;
    const intervalKm = Number(body?.intervalKm);
    const intervalMonths =
      body?.intervalMonths === undefined || body?.intervalMonths === null || body?.intervalMonths === ''
        ? null
        : Number(body.intervalMonths);

    const draft = {
      id: randomUUID(),
      vehicleId: String(body?.vehicleId ?? ''),
      itemCode: `${CUSTOM_ITEM_CODE_PREFIX}${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      titleAr,
      titleEn,
      intervalKm,
      intervalMonths,
      lastDoneOdometer: null,
      lastDoneDate: null,
    };

    const parsed = maintenanceScheduleSchema.safeParse(draft);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, error: `invalid_payload:${issue ? issue.path.join('.') : '?'}:${issue ? issue.message : 'invalid'}` },
        { status: 400 },
      );
    }

    const created = await repo.addMaintenanceSchedule(parsed.data);
    return NextResponse.json({ success: true, data: created });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

/**
 * DELETE /api/schedules?id=… — soft-remove one item (factory or custom).
 * Ownership is resolved through the parent vehicle, the same way every other
 * schedule write authorizes; the row is tombstoned so sync peers receive it.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }
    const user = requireUser(req);
    const repo = new StorageRepository();
    await requireOwnership(repo, 'maintenance_schedules', id, user.id);
    await repo.deleteMaintenanceSchedule(id);
    return NextResponse.json({ success: true, message: 'Deleted successfully' });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, lastDoneOdometer, lastDoneDate, intervalKm, intervalMonths } = body;

    const user = requireUser(req);
    const repo = new StorageRepository();
    await requireOwnership(repo, 'maintenance_schedules', id, user.id);

    await repo.updateMaintenanceSchedule(id, {
      // An explicit null/"" clears the baseline (back to "service record
      // required"); Number(null) would silently store odometer 0.
      lastDoneOdometer: lastDoneOdometer !== undefined
        ? (lastDoneOdometer === null || lastDoneOdometer === '' ? null : Number(lastDoneOdometer))
        : undefined,
      lastDoneDate: lastDoneDate !== undefined ? lastDoneDate : undefined,
      intervalKm: intervalKm !== undefined ? Number(intervalKm) : undefined,
      intervalMonths: intervalMonths !== undefined ? Number(intervalMonths) : undefined,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
