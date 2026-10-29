import { StorageRepository } from '@/persistence/repository';
import {
  AILookupConfig,
  VehicleManualSpecs,
  AILookupResponse,
  lookupFullVehicleManual,
  lookupVehicleScheduleProposal,
  askAiCarDoctor,
} from './ai';
import {
  findPreseededVehicle,
  generateHeuristicSpecs,
  generateHeuristicSchedules,
  generateHeuristicDoctorAdvice,
} from './automotiveDatabase';

export interface ResolvedAiConfig extends AILookupConfig {
  isServerManaged: boolean;
  hasKey: boolean;
}

/**
 * Resolves AI configuration using 4-Tier Hybrid Priority:
 * 1. User BYOK key in settings (if provided)
 * 2. Server Environment Variable (SERVER_GEMINI_API_KEY / GEMINI_API_KEY)
 * 3. Server OpenRouter Key (SERVER_OPENROUTER_API_KEY / OPENROUTER_API_KEY)
 * 4. Fallback in DB settings
 */
export async function resolveAiConfig(repo: StorageRepository): Promise<ResolvedAiConfig> {
  // 1. User BYOK key
  const userKey = await repo.getSetting('ai_api_key');
  const userProvider = ((await repo.getSetting('ai_provider')) as 'gemini' | 'openrouter') || 'gemini';
  if (userKey && userKey.trim().length > 0) {
    return {
      apiKey: userKey.trim(),
      provider: userProvider,
      isServerManaged: false,
      hasKey: true,
    };
  }

  // 2. Server Environment Variable (Gemini)
  const serverGemini = process.env.SERVER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (serverGemini && serverGemini.trim().length > 0) {
    return {
      apiKey: serverGemini.trim(),
      provider: 'gemini',
      isServerManaged: true,
      hasKey: true,
    };
  }

  // 3. Server Environment Variable (OpenRouter)
  const serverOpenRouter = process.env.SERVER_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (serverOpenRouter && serverOpenRouter.trim().length > 0) {
    return {
      apiKey: serverOpenRouter.trim(),
      provider: 'openrouter',
      isServerManaged: true,
      hasKey: true,
    };
  }

  return {
    apiKey: undefined,
    provider: 'gemini',
    isServerManaged: true,
    hasKey: false,
  };
}

/**
 * High-Level Orchestrator for Vehicle OEM Manual
 * Tiers: Cache -> Preseeded DB -> External AI -> Automotive Heuristic
 */
export async function getOrFetchVehicleManual(
  make: string,
  model: string,
  year: number,
  repo: StorageRepository
): Promise<{ specs: VehicleManualSpecs; source: string; fromCache: boolean }> {
  // 1. Check Global SQLite Cache
  const cached = await repo.getGlobalSpecCache(make, model, year);
  if (cached && cached.specs) {
    return { specs: cached.specs, source: cached.source || 'cache', fromCache: true };
  }

  // 2. Check Pre-seeded Master OEM Database
  const preseeded = findPreseededVehicle(make, model, year);
  if (preseeded) {
    await repo.saveGlobalSpecCache(
      make,
      model,
      year,
      preseeded.specs,
      preseeded.schedules,
      preseeded.schedules.recommendedOil,
      'preseeded_oem'
    );
    return { specs: preseeded.specs, source: 'preseeded_oem', fromCache: false };
  }

  // 3. Try External AI via Resolved Config
  const config = await resolveAiConfig(repo);
  if (config.hasKey && config.apiKey) {
    try {
      const specs = await lookupFullVehicleManual(make, model, year, config);
      await repo.saveGlobalSpecCache(
        make,
        model,
        year,
        specs,
        undefined,
        specs.engineOilViscosity,
        config.isServerManaged ? 'server_ai' : 'user_ai'
      );
      return { specs, source: config.isServerManaged ? 'server_ai' : 'user_ai', fromCache: false };
    } catch (err) {
      console.warn('External AI manual lookup failed, falling back to automotive heuristics:', err);
    }
  }

  // 4. Safe Automotive Heuristic Engine
  const heuristicSpecs = generateHeuristicSpecs(make, model, year);
  await repo.saveGlobalSpecCache(
    make,
    model,
    year,
    heuristicSpecs,
    undefined,
    heuristicSpecs.engineOilViscosity,
    'automotive_heuristic'
  );
  return { specs: heuristicSpecs, source: 'automotive_heuristic', fromCache: false };
}

/**
 * High-Level Orchestrator for Vehicle Maintenance Schedule & Oil Proposal
 * Tiers: Cache -> Preseeded DB -> External AI -> Automotive Heuristic
 */
export async function getOrFetchVehicleSchedules(
  make: string,
  model: string,
  year: number,
  repo: StorageRepository
): Promise<{ proposal: AILookupResponse; source: string; fromCache: boolean }> {
  // 1. Check Global SQLite Cache
  const cached = await repo.getGlobalSpecCache(make, model, year);
  if (cached && cached.schedules) {
    return { proposal: cached.schedules, source: cached.source || 'cache', fromCache: true };
  }

  // 2. Check Preseeded Master OEM Database
  const preseeded = findPreseededVehicle(make, model, year);
  if (preseeded) {
    await repo.saveGlobalSpecCache(
      make,
      model,
      year,
      preseeded.specs,
      preseeded.schedules,
      preseeded.schedules.recommendedOil,
      'preseeded_oem'
    );
    return { proposal: preseeded.schedules, source: 'preseeded_oem', fromCache: false };
  }

  // 3. Try External AI
  const config = await resolveAiConfig(repo);
  if (config.hasKey && config.apiKey) {
    try {
      const proposal = await lookupVehicleScheduleProposal(make, model, year, config);
      await repo.saveGlobalSpecCache(
        make,
        model,
        year,
        cached?.specs || {},
        proposal,
        proposal.recommendedOil,
        config.isServerManaged ? 'server_ai' : 'user_ai'
      );
      return { proposal, source: config.isServerManaged ? 'server_ai' : 'user_ai', fromCache: false };
    } catch (err) {
      console.warn('External AI schedule lookup failed, falling back to automotive heuristics:', err);
    }
  }

  // 4. Safe Automotive Heuristic Engine
  const heuristicSchedule = generateHeuristicSchedules(make, model, year);
  await repo.saveGlobalSpecCache(
    make,
    model,
    year,
    cached?.specs || {},
    heuristicSchedule,
    heuristicSchedule.recommendedOil,
    'automotive_heuristic'
  );
  return { proposal: heuristicSchedule, source: 'automotive_heuristic', fromCache: false };
}

/**
 * High-Level Orchestrator for AI Car Doctor
 * Tiers: External AI -> Rule-Based Expert Engine
 */
export async function consultAiDoctor(
  vehicle: { make: string; model: string; year: number; currentOdometer: number },
  userQuery: string,
  recentMaintenance: any[] = [],
  repo: StorageRepository
): Promise<{ advice: string; source: string }> {
  const config = await resolveAiConfig(repo);
  if (config.hasKey && config.apiKey) {
    try {
      const advice = await askAiCarDoctor(vehicle, userQuery, recentMaintenance, config);
      return { advice, source: config.isServerManaged ? 'server_ai' : 'user_ai' };
    } catch (err) {
      console.warn('External AI Doctor failed, falling back to rule-based diagnostic engine:', err);
    }
  }

  // Fallback to rule-based engineering diagnostic engine
  const advice = generateHeuristicDoctorAdvice(vehicle, userQuery, recentMaintenance);
  return { advice, source: 'expert_rule_engine' };
}
