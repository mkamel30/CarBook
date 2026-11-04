'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from '@/i18n/context';
import { readEnvelope } from '@/hooks/apiEnvelope';
import { settingsSaveBody, DEFAULT_FUEL_TYPES } from '@/hooks/formModel';

const INITIAL_SETTINGS = {
  provider: 'gemini',
  apiKey: '',
  hasApiKey: false,
  maskedApiKey: '',
  fuelTypes: DEFAULT_FUEL_TYPES,
};

/** AI provider + fuel-price settings (A5). */
export function useSettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [settingsMsg, setSettingsMsg] = useState('');
  const [settingsError, setSettingsError] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await readEnvelope(res);
      if (data.success) {
        setSettings((prev) => ({
          ...prev,
          provider: data.data.provider,
          hasApiKey: data.data.hasApiKey,
          maskedApiKey: data.data.maskedApiKey || '',
          fuelTypes: data.data.fuelTypes || prev.fuelTypes,
        }));
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  }, []);

  // Success and failure must never share one message slot.
  const handleSaveSettings = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsMsg('');
    setSettingsError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsSaveBody(settings)),
      });
      const data = await readEnvelope(res);
      if (data.success) {
        setSettingsMsg(t('set_save_success'));
        setTimeout(() => setSettingsMsg(''), 3000);
        loadSettings();
      } else {
        setSettingsError(data.error || t('err_request_failed'));
      }
    } catch (err: any) {
      setSettingsError(err?.message || t('err_request_failed'));
    }
  }, [settings, t, loadSettings]);

  return { settings, setSettings, settingsMsg, settingsError, loadSettings, handleSaveSettings };
}
