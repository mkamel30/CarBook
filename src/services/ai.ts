import { z } from 'zod';
import { AiAnswerLang, DEFAULT_AI_LANG, DOCTOR_FRAMING } from './aiLang';

export const aiProposalItemSchema = z.object({
  itemCode: z.string(),
  titleAr: z.string(),
  titleEn: z.string(),
  intervalKm: z.number().positive(),
  intervalMonths: z.number().positive().optional().nullable(),
});

export const aiLookupResponseSchema = z.object({
  recommendedOil: z.string(),
  maintenanceItems: z.array(aiProposalItemSchema),
  confidenceNotes: z.string().optional(),
});

export type AILookupResponse = z.infer<typeof aiLookupResponseSchema>;

export interface AILookupConfig {
  apiKey?: string;
  provider: 'gemini' | 'openrouter';
  customEndpoint?: string;
  model?: string;
}

/**
 * Arabic-first, English-overlaid OEM spec record.
 *
 * The plain fields are the values of record and follow the app's existing
 * `*Ar`/`*En` pair convention (see schedule `titleAr`/`titleEn`): Arabic-first,
 * because CarBook is an Arabic product. Each one carries an optional `*En` twin
 * with the same facts written for an English/Polish workshop, which is what the
 * Manual and Report tabs show when the UI language is not Arabic.
 *
 * They are optional because spec rows cached before this existed — and the
 * preseeded/heuristic engines for a car nobody has translated — carry Arabic
 * only; readers fall back to the main value rather than showing a blank.
 */
export const vehicleManualSpecsSchema = z.object({
  engineOilViscosity: z.string(),
  engineOilCapacityLiters: z.string(),
  transmissionFluidType: z.string(),
  coolantType: z.string(),
  brakeFluidType: z.string(),
  tirePressurePsiFront: z.string(),
  tirePressurePsiRear: z.string(),
  fuelTankCapacityLiters: z.string(),
  recommendedFuelOctane: z.string(),
  sparkPlugType: z.string(),
  batterySpec: z.string(),
  generalNotesAr: z.string(),
  generalNotesEn: z.string().optional(),
  engineOilViscosityEn: z.string().optional(),
  engineOilCapacityLitersEn: z.string().optional(),
  transmissionFluidTypeEn: z.string().optional(),
  coolantTypeEn: z.string().optional(),
  brakeFluidTypeEn: z.string().optional(),
  fuelTankCapacityLitersEn: z.string().optional(),
  recommendedFuelOctaneEn: z.string().optional(),
  sparkPlugTypeEn: z.string().optional(),
  batterySpecEn: z.string().optional(),
});

export type VehicleManualSpecs = z.infer<typeof vehicleManualSpecsSchema>;

export const OPENROUTER_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3.5-lightning:free',
  'google/gemma-4-31b-it:free',
  'meta-llama/llama-3.3-70b-instruct:free',
];

const MAX_AI_ATTEMPTS = 3;
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 30_000;

/**
 * A failure that will repeat identically on every retry (bad credentials,
 * rejected URL, provider redirect). Throwing this escapes the retry loop so the
 * caller keeps its heuristic fallback instead of burning quota three times.
 * Malformed responses stay retryable because the loop rotates models.
 */
export class NonRetryableAiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableAiError';
  }
}

const BLOCKED_HOST_SUFFIXES = ['.local', '.internal', '.home.arpa', '.lan'];

const BLOCKED_IPV4: Array<[string, number]> = [
  ['0.0.0.0', 8],        // "this" network, includes 0.0.0.0
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],    // CGNAT, includes Alibaba metadata 100.100.100.200
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],   // link-local, includes cloud metadata
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],      // multicast
  ['240.0.0.0', 4],      // reserved, includes 255.255.255.255
];

const BLOCKED_IPV4_VALUES = BLOCKED_IPV4.map(([base, bits]) => [ipToInt(base)!, bits] as const);

function ipToInt(dotted: string): number | null {
  const parts = dotted.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

/**
 * Parse every inet_aton spelling of an IPv4 literal: dotted-quad plus the
 * decimal, octal (leading 0), hex (0x) and abbreviated 1-3 component forms,
 * where the last component absorbs the remaining bytes.
 */
function parseIpv4Literal(host: string): number | null {
  if (!/^[0-9a-fx.]+$/i.test(host) || !/[0-9]/.test(host)) return null;
  const parts = host.split('.');
  if (parts.length < 1 || parts.length > 4 || parts.some((p) => p === '')) return null;

  const octets: number[] = [];
  for (const p of parts) {
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(p)) n = parseInt(p.slice(2), 16);
    else if (/^0[0-7]+$/.test(p)) n = parseInt(p, 8);
    else if (/^\d+$/.test(p)) n = parseInt(p, 10);
    else return null; // alphabetic hostname, not an address literal
    if (!Number.isFinite(n) || n < 0) return null;
    octets.push(n);
  }

  const last = octets[octets.length - 1];
  if (octets.slice(0, -1).some((o) => o > 255)) return null;
  if (last > Math.pow(2, 8 * (4 - (octets.length - 1))) - 1) return null;

  let value = last;
  for (let i = 0; i < octets.length - 1; i++) {
    value += octets[i] * Math.pow(2, 8 * (3 - i));
  }
  return value;
}

function isBlockedIpv6(raw: string): boolean {
  const h = raw.toLowerCase();
  const embedded = h.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (embedded) return isBlockedAddress(embedded[1]);
  if (h === '::' || h === '::1') return true;
  if (/^(fe8|fc|fd|ff|::f)/.test(h)) return true; // link-local, ULA, multicast, v4-mapped-ish
  return false;
}

function isBlockedAddress(host: string): boolean {
  const h = host.toLowerCase().replace(/\.+$/, '');
  if (h === '' || h === 'localhost' || h.endsWith('.localhost')) return true;
  if (BLOCKED_HOST_SUFFIXES.some((s) => h.endsWith(s))) return true;
  if (h === '[::]' || h === '::') return true;

  if (h.startsWith('[')) {
    const inner = h.slice(1, -1);
    if (!/^[0-9a-f:.]+$/i.test(inner)) return false;
    if (!inner.includes('.')) return isBlockedIpv6(inner);
    const int = ipToInt(inner);
    if (int !== null) return BLOCKED_IPV4_VALUES.some(([base, bits]) => matchesCidr(int, base, bits));
    return isBlockedIpv6(inner);
  }

  if (h.includes(':')) return isBlockedIpv6(h);

  const int = parseIpv4Literal(h);
  if (int !== null) {
    return BLOCKED_IPV4_VALUES.some(([base, bits]) => matchesCidr(int, base, bits));
  }
  return false;
}

function matchesCidr(value: number, base: number, bits: number): boolean {
  const shift = 32 - bits;
  return Math.floor(value / Math.pow(2, shift)) === Math.floor(base / Math.pow(2, shift));
}

/**
 * Reject anything that is not a public HTTPS origin before the provider key and
 * the user's maintenance history leave the process. Note this validates the URL
 * text only: a hostname that resolves to a private address (DNS rebinding) needs
 * resolve-then-dial, which this layer does not do.
 */
export function assertSafeEndpoint(endpoint: string): URL {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new NonRetryableAiError('Invalid AI endpoint URL');
  }
  if (url.protocol !== 'https:') {
    throw new NonRetryableAiError('Insecure protocol rejected; HTTPS required');
  }
  if (url.username || url.password) {
    throw new NonRetryableAiError('Credentials embedded in the AI endpoint are rejected');
  }
  if (isBlockedAddress(url.hostname)) {
    throw new NonRetryableAiError('Loopback/internal network access rejected');
  }
  return url;
}

function resolveEndpoint(config: AILookupConfig): string {
  if (config.provider === 'openrouter') {
    return config.customEndpoint || 'https://openrouter.ai/api/v1/chat/completions';
  }
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(config.apiKey!)}`;
}

/** POST with a deadline, and never follow a redirect — that would replay the bearer key to another host. */
async function postToProvider(
  endpoint: string,
  headers: Record<string, string>,
  body: string,
  fetchFn: typeof fetch,
): Promise<Response> {
  const res = await fetchFn(endpoint, {
    method: 'POST',
    headers,
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  if (res.status >= 300 && res.status < 400) {
    throw new NonRetryableAiError(`AI provider redirected (${res.status}); not followed`);
  }
  if (!res.ok) {
    const message = `AI Provider HTTP ${res.status}`;
    // 4xx (except rate limit) is a stable verdict about this request, not a blip.
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw new NonRetryableAiError(message);
    }
    throw new Error(message);
  }
  return res;
}

function authHeaders(config: AILookupConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.provider === 'openrouter') {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
    headers['HTTP-Referer'] = 'http://localhost:3070';
    headers['X-Title'] = 'Car Maintenance Followup';
  }
  return headers;
}

/**
 * Runs `task`, rotating to the next model on a retryable failure. The API key is
 * checked up front so a missing key costs one attempt, not three.
 */
async function withAiRetries<T>(label: string, config: AILookupConfig, task: (model: string) => Promise<T>): Promise<T> {
  if (!config.apiKey) throw new NonRetryableAiError('API key is not configured');
  let lastError: any = null;

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    const rotatingModel = OPENROUTER_MODELS[attempt % OPENROUTER_MODELS.length];
    try {
      return await task(config.model || rotatingModel);
    } catch (err: any) {
      if (err instanceof NonRetryableAiError) throw err;
      lastError = err;
      if (attempt < MAX_AI_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  throw new Error(`${label} failed after ${MAX_AI_ATTEMPTS} attempts: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Fetch full verified vehicle OEM specs manual via AI
 */
export async function lookupFullVehicleManual(
  make: string,
  model: string,
  year: number,
  config: AILookupConfig,
  fetchFn = fetch,
  engineCc?: string | null
): Promise<VehicleManualSpecs> {
  // The manual result is cached GLOBALLY per make/model/year and shared by
  // every user and language, so it must stay language-neutral: the schema is
  // bilingual (each Arabic-first value plus its `*En` twin) and the UI picks one
  // side at render time. Threading a request language through here would bake
  // the first caller's language into everyone else's cache row.
  const prompt = `You are a certified master automotive engineer with access to official OEM factory service manuals.
For a ${year} ${make} ${model}${engineCc ? ` (Engine / Motor CC: ${engineCc})` : ''}, provide exact factory technical specifications and fluid capacities.

Respond with ONLY valid JSON with no markdown and no backticks:
{
  "engineOilViscosity": "0W-20 Full Synthetic (API SP / ILSAC GF-6) أو 5W-30",
  "engineOilViscosityEn": "same facts written for an English-speaking workshop",
  "engineOilCapacityLiters": "4.2 لتر مع الفلتر (3.9 لتر بدون فلتر)",
  "engineOilCapacityLitersEn": "4.2 L with filter (3.9 L without filter)",
  "transmissionFluidType": "زيت ناقل الحركة المعتمد للموديل",
  "transmissionFluidTypeEn": "the approved transmission fluid, in English",
  "coolantType": "سائل التبريد المعتمد",
  "coolantTypeEn": "the approved coolant, in English",
  "brakeFluidType": "DOT 4 أو DOT 5.1",
  "brakeFluidTypeEn": "DOT 4 or DOT 5.1",
  "tirePressurePsiFront": "32 PSI (2.2 Bar)",
  "tirePressurePsiRear": "32 PSI (2.2 Bar)",
  "fuelTankCapacityLiters": "50 لتر",
  "fuelTankCapacityLitersEn": "50 L",
  "recommendedFuelOctane": "بنزين 92 أو 95 خالٍ من الرصاص",
  "recommendedFuelOctaneEn": "unleaded 92 or 95",
  "sparkPlugType": "اسم القطعة الأصلي مع الفجوة بالمليمتر",
  "sparkPlugTypeEn": "the same part spec in English",
  "batterySpec": "مواصفات البطارية",
  "batterySpecEn": "the same battery spec in English",
  "generalNotesAr": "نصائح وإرشادات صيانة هامة لهذا الموديل بالتحديد باللغة العربية",
  "generalNotesEn": "the same maintenance advice for this exact model, in English"
}

Arabic is the primary value; every *En field is the English rewrite of the SAME facts. Keep part numbers, viscosity grades, pressures and standards verbatim in both languages — they are not translatable.`;

  return withAiRetries('Manual lookup', config, async (currentModel) => {
    const endpoint = resolveEndpoint(config);
    assertSafeEndpoint(endpoint);

    const body =
      config.provider === 'openrouter'
        ? JSON.stringify({
            model: currentModel,
            messages: [{ role: 'user', content: prompt }],
          })
        : JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          });

    const res = await postToProvider(endpoint, authHeaders(config), body, fetchFn);

    const rawJson = await res.json();
    const textContent =
      config.provider === 'openrouter'
        ? rawJson.choices?.[0]?.message?.content || '{}'
        : rawJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    return vehicleManualSpecsSchema.parse(JSON.parse(extractJson(textContent)));
  });
}

/**
 * AI Car Doctor Diagnosis & Consultation
 */
export async function askAiCarDoctor(
  vehicle: { make: string; model: string; year: number; engineCc?: string | null; currentOdometer: number },
  userQuery: string,
  recentMaintenance: any[] = [],
  config: AILookupConfig,
  fetchFn = fetch,
  engineCc?: string | null,
  lang: AiAnswerLang = DEFAULT_AI_LANG
): Promise<string> {
  // The instruction block is English for every language and only the required
  // ANSWER language varies: one prompt to maintain, and Arabic behaviour is
  // unchanged (it was always "answer in Arabic"). The history lines are labelled
  // in the answer language so a Polish/English reply is not quoting Arabic rows.
  const framing = DOCTOR_FRAMING[lang];
  const maintSummary = (recentMaintenance || []).slice(0, 5).map(m =>
    `- ${m.serviceDate}: ${m.title}${framing.atOdometer} ${m.odometer} ${framing.km}`
  ).join('\n') || framing.noHistory;

  const prompt = `You are a certified automotive maintenance engineer acting as a personal technical advisor.
Current user vehicle data:
- Make and model: ${vehicle.make} ${vehicle.model} (${vehicle.year})${vehicle.engineCc ? ` - ${framing.engineCapacity}: ${vehicle.engineCc}` : ''}
- ${framing.odometer}: ${vehicle.currentOdometer.toLocaleString()} ${framing.km}
- ${framing.recentServices}:
${maintSummary}

The user's question or complaint:
"${userQuery}"

Required:
1. Diagnose the most probable cause, tied to the odometer reading and the service history above.
2. Give concrete practical advice: what should the technician check first, and is the car safe to drive or must it stop immediately?
3. List the part numbers or specifications of any parts likely to be replaced.

${framing.answerInstruction} Use a clear, direct engineering style with formatted bullet points.`;

  return withAiRetries('Doctor query', config, async (currentModel) => {
    const endpoint = resolveEndpoint(config);
    assertSafeEndpoint(endpoint);

    const body =
      config.provider === 'openrouter'
        ? JSON.stringify({
            model: currentModel,
            messages: [{ role: 'user', content: prompt }],
          })
        : JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          });

    const res = await postToProvider(endpoint, authHeaders(config), body, fetchFn);

    const rawJson = await res.json();
    return config.provider === 'openrouter'
      ? rawJson.choices?.[0]?.message?.content || framing.noReply
      : rawJson.candidates?.[0]?.content?.parts?.[0]?.text || framing.noReply;
  });
}

function extractJson(text: string): string {
  // Strip code fences if present
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

  // Find opening '{' and matching closing '}'
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return cleaned.substring(startIdx, endIdx + 1);
  }
  return cleaned;
}

/**
 * AI Vehicle Schedule Lookup Service with bounded retry (max 3 attempts).
 * Enforces Core Rule #3: Output is strictly proposed data, validated with Zod,
 * never directly persisted without user review.
 */
export async function lookupVehicleScheduleProposal(
  make: string,
  model: string,
  year: number,
  config: AILookupConfig,
  fetchFn = fetch,
  engineCc?: string | null
): Promise<AILookupResponse> {
  const prompt = `You are a vehicle maintenance expert. For a ${year} ${make} ${model}${engineCc ? ` (Engine / Motor CC: ${engineCc})` : ''}, provide:
1. Recommended engine oil type/viscosity (e.g. 5W-30 Full Synthetic).
2. Standard recommended periodic maintenance schedule items with intervals in kilometers.

IMPORTANT: Return ONLY a raw JSON object with no explanations, no text before or after, and no backticks.
Schema:
{
  "recommendedOil": "5W-30 Synthetic",
  "maintenanceItems": [
    {
      "itemCode": "engine_oil",
      "titleAr": "تغيير زيت المحرك والفلتر",
      "titleEn": "Engine Oil & Filter",
      "intervalKm": 10000,
      "intervalMonths": 6
    },
    {
      "itemCode": "air_filter",
      "titleAr": "تغيير فلتر الهواء",
      "titleEn": "Air Filter",
      "intervalKm": 20000,
      "intervalMonths": 12
    },
    {
      "itemCode": "brake_pads",
      "titleAr": "فحص وتغيير تيل الفرامل",
      "titleEn": "Brake Pads",
      "intervalKm": 30000,
      "intervalMonths": 18
    },
    {
      "itemCode": "spark_plugs",
      "titleAr": "تغيير شمعات الاحتراق",
      "titleEn": "Spark Plugs",
      "intervalKm": 40000,
      "intervalMonths": 24
    }
  ],
  "confidenceNotes": "Standard manufacturer maintenance intervals"
}`;

  return withAiRetries('AI lookup', config, async (currentModel) => {
    // Origin / URL validation (prevent SSRF loopback) before the key is sent.
    const endpoint = resolveEndpoint(config);
    assertSafeEndpoint(endpoint);

    const body =
      config.provider === 'openrouter'
        ? JSON.stringify({
            model: currentModel,
            messages: [{ role: 'user', content: prompt }],
          })
        : JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          });

    const res = await postToProvider(endpoint, authHeaders(config), body, fetchFn);

    const rawJson = await res.json();
    const textContent =
      config.provider === 'openrouter'
        ? rawJson.choices?.[0]?.message?.content || '{}'
        : rawJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    return aiLookupResponseSchema.parse(JSON.parse(extractJson(textContent)));
  });
}
