import { NextRequest, NextResponse } from 'next/server';
import { StorageRepository } from '@/persistence/repository';
import { derivedItemsForServiceType } from '@/services/presets';
import { authErrorResponse, requireOwnership, requireUser } from '@/services/authz';

/**
 * The log modal's optional explicit link (`maint_linked_item_label`). It is a
 * write-time instruction only: maintenance_logs has no column for it and the
 * sync column whitelist is fixed, so the choice is applied immediately and is
 * not persisted on the log row.
 */
function explicitItemCode(body: any): string | null {
  const raw = typeof body === 'string' ? body : body?.linkedItemCode;
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value ? value : null;
}

function dedupe(codes: Array<string | null | undefined>): string[] {
  return Array.from(new Set(codes.filter((c): c is string => !!c)));
}

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

    const logs = await repo.getMaintenanceLogsByVehicle(vehicleId);
    return NextResponse.json({ success: true, data: logs });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const user = requireUser(req);
    const repo = new StorageRepository();
    await requireOwnership(repo, 'vehicles', body?.vehicleId, user.id);
    const log = await repo.addMaintenanceLog(body);

    const explicit = explicitItemCode(body);
    const itemCodes = explicit ? [explicit] : derivedItemsForServiceType(log.serviceType);
    const linked = await repo.linkSchedulesForItems({
      vehicleId: log.vehicleId!,
      itemCodes,
      sourceLog: log,
      explicitItemCode: explicit,
    });

    return NextResponse.json({ success: true, data: { ...log, linkedSchedules: linked.length } });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...data } = body;
    const user = requireUser(req);
    const repo = new StorageRepository();
    await requireOwnership(repo, 'maintenance_logs', id, user.id);

    // Read the stored row first: re-linking must also cover the items the PREVIOUS
    // service type evidenced, or an edit would leave them stale.
    const before = await repo.getMaintenanceLogById(id);
    const updated = await repo.updateMaintenanceLog(id, data);

    const explicit = explicitItemCode(body);
    const itemCodes = dedupe([
      ...derivedItemsForServiceType(before?.serviceType),
      ...derivedItemsForServiceType(updated.serviceType),
      explicit,
    ]);
    const linked = await repo.linkSchedulesForItems({
      vehicleId: updated.vehicleId!,
      itemCodes,
      sourceLog: updated,
      explicitItemCode: explicit,
    });

    return NextResponse.json({ success: true, data: { ...updated, linkedSchedules: linked.length } });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const user = requireUser(req);
    const repo = new StorageRepository();
    await requireOwnership(repo, 'maintenance_logs', id, user.id);

    const before = await repo.getMaintenanceLogById(id!);
    await repo.deleteMaintenanceLog(id!);

    // Keep the schedule consistent with the remaining records. Baselines only ever
    // move forward, so removing a log never rewinds or clears an item: the owner
    // corrects that with "Set last service" (alerts_btn_edit_baseline) instead.
    if (before) {
      await repo.linkSchedulesForItems({
        vehicleId: before.vehicleId!,
        itemCodes: derivedItemsForServiceType(before.serviceType),
      });
    }

    return NextResponse.json({ success: true, message: 'Deleted successfully' });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
