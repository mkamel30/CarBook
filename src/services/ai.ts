import { z } from 'zod';

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
  fetchFn = fetch
): Promise<AILookupResponse> {
  const prompt = `You are a vehicle maintenance expert. For a vehicle with Make: "${make}", Model: "${model}", Year: ${year}, provide:
1. Recommended engine oil specification/viscosity (e.g. 5W-30 Full Synthetic API SP).
2. Standard recommended periodic maintenance schedule items with intervals in kilometers and optional months.

Respond ONLY with a valid JSON object matching this schema:
{
  "recommendedOil": "string",
  "maintenanceItems": [
    {
      "itemCode": "string",
      "titleAr": "string (in Arabic)",
      "titleEn": "string (in English)",
      "intervalKm": number,
      "intervalMonths": number or null
    }
  ],
  "confidenceNotes": "string (optional remarks)"
}`;

  let attempts = 0;
  const maxAttempts = 3;
  let lastError: any = null;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      if (!config.apiKey) {
        throw new Error('API key is not configured');
      }

      // Origin / URL validation (prevent SSRF loopback)
      const endpoint = config.provider === 'openrouter'
        ? (config.customEndpoint || 'https://openrouter.ai/api/v1/chat/completions')
        : `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(config.apiKey)}`;

      const parsedUrl = new URL(endpoint);
      if (!parsedUrl.protocol.startsWith('https')) {
        throw new Error('Insecure protocol rejected; HTTPS required');
      }
      if (['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254'].includes(parsedUrl.hostname)) {
        throw new Error('Loopback/Internal network access rejected');
      }

      const body = config.provider === 'openrouter'
        ? JSON.stringify({
            model: 'google/gemini-2.0-flash-exp:free',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
          })
        : JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          });

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.provider === 'openrouter') {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const res = await fetchFn(endpoint, {
        method: 'POST',
        headers,
        body,
      });

      if (!res.ok) {
        throw new Error(`AI Provider responded with HTTP ${res.status}`);
      }

      const rawJson = await res.json();
      let textContent = '';
      if (config.provider === 'openrouter') {
        textContent = rawJson.choices?.[0]?.message?.content || '{}';
      } else {
        textContent = rawJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      }

      const parsedData = JSON.parse(textContent);
      return aiLookupResponseSchema.parse(parsedData);
    } catch (err: any) {
      lastError = err;
      if (attempts >= maxAttempts) {
        break;
      }
      // Exponential backoff
      await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempts - 1)));
    }
  }

  throw new Error(`AI lookup failed after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`);
}
