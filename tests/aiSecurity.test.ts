import { describe, it, expect, vi } from 'vitest';
import {
  assertSafeEndpoint,
  NonRetryableAiError,
  askAiCarDoctor,
  lookupFullVehicleManual,
  lookupVehicleScheduleProposal,
  OPENROUTER_MODELS,
  type AILookupConfig,
} from '@/services/ai';

const config = (over: Partial<AILookupConfig> = {}): AILookupConfig => ({
  provider: 'openrouter',
  apiKey: 'test-key',
  ...over,
});

const validProposal = JSON.stringify({
  recommendedOil: '5W-30 Synthetic',
  maintenanceItems: [{ itemCode: 'oil_filter', titleAr: 'زيت', titleEn: 'Oil', intervalKm: 10000 }],
});

function jsonResponse(payload: any) {
  return { ok: true, status: 200, json: async () => payload };
}
function openrouterText(text: string) {
  return jsonResponse({ choices: [{ message: { content: text } }] });
}
function httpError(status: number) {
  return { ok: false, status, json: async () => ({}) };
}

/** Fake transport that replays `script` in order, repeating the last entry forever. */
function scripted(...script: any[]) {
  const calls: Array<{ url: string; init: any }> = [];
  const fetchFn = vi.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return script[Math.min(calls.length - 1, script.length - 1)];
  });
  return { fetchFn, calls };
}

describe('AI endpoint SSRF guard', () => {
  it('accepts public https origins', () => {
    for (const url of [
      'https://openrouter.ai/api/v1/chat/completions',
      'https://generativelanguage.googleapis.com/v1beta/models/x',
      'https://8.8.8.8/v1/chat',          // public literal: this layer cannot do DNS, so it is allowed
      'https://ai.example.co.uk:8443/v1',
    ]) {
      expect(assertSafeEndpoint(url).hostname, url).toBeTruthy();
    }
  });

  it('rejects anything that is not plain https', () => {
    for (const url of [
      'http://openrouter.ai/api',           // cleartext
      'file:///etc/passwd',
      'not a url',
      'https://user:password@openrouter.ai/', // credentials smuggled in the URL
      'https://sk-secret@openrouter.ai/',
    ]) {
      expect(() => assertSafeEndpoint(url), url).toThrow(NonRetryableAiError);
    }
  });

  it('blocks loopback and private ranges in every inet_aton spelling', () => {
    for (const url of [
      'https://127.0.0.1/v1',
      'https://127.1/v1',                    // 2-component abbreviated form
      'https://2130706433/v1',               // single decimal == 127.0.0.1
      'https://0x7f.0x1/v1',                 // hex components
      'https://0177.0.0.1/v1',               // octal (leading 0) == 127.0.0.1
      'https://0/v1',
      'https://10.1.2.3/v1',
      'https://172.16.5.4/v1',
      'https://192.168.0.9/v1',
      'https://169.254.169.254/v1',          // cloud metadata
      'https://100.100.100.200/v1',          // CGNAT (Alibaba metadata)
      'https://255.255.255.255/v1',
      'https://224.0.0.1/v1',                // multicast
    ]) {
      expect(() => assertSafeEndpoint(url), url).toThrow(/Loopback|internal/i);
    }
  });

  it('blocks internal hostnames and ipv6 local addresses', () => {
    for (const url of [
      'https://localhost/v1',
      'https://ai-service.local/v1',
      'https://gateway.internal/v1',
      'https://printer.lan/v1',
      'https://[::1]/v1',
      'https://[::]/v1',
      'https://[fe80::1]/v1',                // link-local
      'https://[fd00::dead]/v1',             // unique local
      'https://[ff02::1]/v1',                // multicast
      'https://[::ffff:127.0.0.1]/v1',       // v4-mapped loopback
    ]) {
      expect(() => assertSafeEndpoint(url), url).toThrow(NonRetryableAiError);
    }
  });

  it('validates the endpoint before the key leaves the process', async () => {
    const { fetchFn, calls } = scripted(openrouterText(validProposal));
    await expect(
      lookupVehicleScheduleProposal('Toyota', 'Corolla', 2022, config({ customEndpoint: 'https://169.254.169.254/last-key' }), fetchFn)
    ).rejects.toThrow(NonRetryableAiError);
    expect(calls).toHaveLength(0);
  });
});

describe('AI transport hardening', () => {
  it('posts with redirect:manual and a deadline signal', async () => {
    const { fetchFn, calls } = scripted(openrouterText(validProposal));
    await lookupVehicleScheduleProposal('Toyota', 'Corolla', 2022, config(), fetchFn);

    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.redirect).toBe('manual');
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0].init.signal.aborted).toBe(false);
    expect(calls[0].init.headers.Authorization).toBe('Bearer test-key');
  });

  it('never follows a provider redirect, because it would replay the bearer key to another host', async () => {
    const { fetchFn, calls } = scripted({ ok: true, status: 302, json: async () => ({}) });
    await expect(
      askAiCarDoctor({ make: 'Toyota', model: 'A', year: 2020, currentOdometer: 1 }, 'noise?', [], config(), fetchFn)
    ).rejects.toThrow(/redirect/i);
    expect(calls).toHaveLength(1);
  });
});

describe('AI retry classification', () => {
  it('costs zero attempts when no key is configured', async () => {
    const { fetchFn, calls } = scripted(openrouterText(validProposal));
    await expect(
      lookupVehicleScheduleProposal('Toyota', 'Corolla', 2022, config({ apiKey: undefined }), fetchFn)
    ).rejects.toThrow(/API key/i);
    expect(calls).toHaveLength(0);
  });

  it('fails fast on a permanent 4xx instead of burning the quota three times', async () => {
    for (const status of [401, 403, 404]) {
      const { fetchFn, calls } = scripted(httpError(status));
      await expect(
        lookupFullVehicleManual('Toyota', 'Corolla', 2022, config(), fetchFn)
      ).rejects.toBeInstanceOf(NonRetryableAiError);
      expect(calls, String(status)).toHaveLength(1);
    }
  });

  it('retries transient failures up to the bound, then gives up', async () => {
    const { fetchFn, calls } = scripted(httpError(503), httpError(429), httpError(500));
    await expect(
      lookupVehicleScheduleProposal('Toyota', 'Corolla', 2022, config(), fetchFn)
    ).rejects.toThrow(/failed after 3 attempts/);
    expect(calls).toHaveLength(3);
  });

  it('rotates models on a malformed answer and recovers', async () => {
    const { fetchFn, calls } = scripted(httpError(500), openrouterText('sorry, no json here'));
    await expect(
      lookupVehicleScheduleProposal('Toyota', 'Corolla', 2022, config(), fetchFn)
    ).rejects.toThrow(/failed after 3 attempts/);
    expect(calls).toHaveLength(3);
    const models = calls.map((c) => JSON.parse(c.init.body).model);
    expect(models).toEqual([OPENROUTER_MODELS[0], OPENROUTER_MODELS[1], OPENROUTER_MODELS[2]]);
  });

  it('sends a fenced answer to the parser rather than retrying it', async () => {
    const { fetchFn } = scripted(openrouterText('```json\n' + validProposal + '\n```'));
    const proposal = await lookupVehicleScheduleProposal('Toyota', 'Corolla', 2022, config(), fetchFn);
    expect(proposal.recommendedOil).toBe('5W-30 Synthetic');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
