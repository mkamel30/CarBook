import React from 'react';
import { Bell, ChevronDown, Globe, LogOut, Settings, User } from 'lucide-react';
import { useTranslation } from '@/i18n/context';
import { Menu, MenuItem } from '@/components/ui/Menu';
import { GoogleIcon } from '@/components/ui/GoogleIcon';

export interface MobileTopBarProps {
  vehicles: any[];
  selectedVehicle: any | null;
  onSelectVehicle: (v: any | null) => void;
  activeTab: string;
  onSelectTab: (tab: any) => void;
  currentUser?: { id: string; email: string; name: string; picture: string | null } | null;
  onLoginGoogle?: () => void;
  onLogout?: () => void;
  urgentCount?: number;
}

// Short codes for the compact trigger chip come from the dictionaries; the open
// menu always lists the endonyms straight from the context `languages` array,
// so adding a fourth language needs no change in this component.
const LANG_SHORT_KEY: Record<string, string> = { ar: 'lang_short_ar', en: 'lang_short_en', pl: 'lang_short_pl' };

const iconButton = (active: boolean) =>
  `relative p-1.5 rounded-full border transition active:scale-95 ${
    active
      ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
      : 'bg-slate-900 border-slate-700 text-slate-300'
  }`;

const vehicleLine = (v: any) => `${v.name} • ${v.licensePlate || `${v.make} ${v.model}`}`;

export const MobileTopBar: React.FC<MobileTopBarProps> = ({
  vehicles,
  selectedVehicle,
  onSelectVehicle,
  activeTab,
  onSelectTab,
  currentUser,
  onLoginGoogle,
  onLogout,
  urgentCount = 0,
}) => {
  const { t, lang, setLang, languages } = useTranslation();
  const shortKey = LANG_SHORT_KEY[lang];

  return (
    <header className="md:hidden sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 px-3.5 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 flex items-center justify-between gap-2 shrink-0">
      {/* Leading group: brand, odometer chip, vehicle identity + switcher. */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="w-8 h-8 rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center shrink-0">
          <img src="/logo.png" alt="CarBook" className="w-8 h-8 object-cover" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="font-bold text-xs tracking-wide">CarBook</h1>
            {selectedVehicle && (
              <span className="text-[10px] bg-amber-500/15 text-amber-400 font-mono font-bold px-1.5 py-0.5 rounded">
                {selectedVehicle.currentOdometer?.toLocaleString()} {t('unit_km')}
              </span>
            )}
          </div>

          {vehicles.length > 1 ? (
            // Multi-vehicle switching stays a single tap, anchored to the
            // vehicle identity instead of a dropdown picker in the actions row.
            <Menu
              triggerLabel={t('vehicle_actions_aria')}
              ariaLabel={t('nav_current_vehicle')}
              title={t('nav_current_vehicle')}
              align="start"
              containerClassName="min-w-0 max-w-full"
              triggerClassName="flex items-center gap-1 max-w-full min-w-0 px-1.5 py-0.5 -mx-1 rounded-lg border border-slate-800 bg-slate-900/70 text-[11px] text-slate-300 font-medium active:scale-95 transition"
              triggerContent={
                <>
                  <span className="min-w-0 truncate">
                    {selectedVehicle ? vehicleLine(selectedVehicle) : t('app_select_prompt')}
                  </span>
                  <ChevronDown className="w-3 h-3 text-amber-400 shrink-0" />
                </>
              }
            >
              {vehicles.map((v) => (
                <MenuItem
                  key={v.id}
                  selected={v.id === selectedVehicle?.id}
                  onClick={() => onSelectVehicle(v)}
                >
                  {vehicleLine(v)}
                </MenuItem>
              ))}
            </Menu>
          ) : selectedVehicle ? (
            <span className="text-[11px] text-slate-300 font-medium truncate block">
              {vehicleLine(selectedVehicle)}
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">{t('app_select_prompt')}</span>
          )}
        </div>
      </div>

      {/* Trailing group, conventional priority: alerts, language, settings, account. */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => onSelectTab('alerts')}
          className={iconButton(activeTab === 'alerts')}
          title={t('nav_alerts')}
          aria-label={t('nav_alerts')}
        >
          <Bell className="w-3.5 h-3.5" />
          {urgentCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
              {urgentCount}
            </span>
          )}
        </button>

        {/* Language: Globe trigger that opens the full supported-language list. */}
        <Menu
          triggerLabel={t('lang_menu_title')}
          ariaLabel={t('aria_language_menu')}
          title={t('lang_menu_title')}
          hint={t('lang_menu_hint')}
          align="end"
          triggerClassName="flex items-center gap-1 px-2 py-1 rounded-full border border-slate-700 bg-slate-900 text-slate-200 text-[10px] font-bold active:scale-95 transition"
          triggerContent={
            <>
              <Globe className="w-3.5 h-3.5 text-amber-400" />
              <span>{shortKey ? t(shortKey) : lang.toUpperCase()}</span>
            </>
          }
        >
          {languages.map((l: { code: string; name: string }) => (
            <MenuItem key={l.code} selected={l.code === lang} onClick={() => setLang(l.code)}>
              {l.name}
            </MenuItem>
          ))}
        </Menu>

        <button
          onClick={() => onSelectTab('settings')}
          className={iconButton(activeTab === 'settings')}
          title={t('nav_settings')}
          aria-label={t('nav_settings')}
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Account: avatar menu with the identity line + sign out (or Google sign-in). */}
        <Menu
          triggerLabel={t('aria_open_menu')}
          ariaLabel={t('nav_account')}
          title={t('nav_account')}
          align="end"
          triggerClassName="rounded-full border border-slate-700 bg-slate-900 active:scale-95 transition overflow-hidden flex items-center justify-center"
          triggerContent={
            currentUser?.picture ? (
              <img src={currentUser.picture} alt={currentUser.name} className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <span className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 font-bold text-[11px] flex items-center justify-center">
                {currentUser ? currentUser.name.charAt(0).toUpperCase() : <User className="w-3.5 h-3.5" />}
              </span>
            )
          }
        >
          {currentUser ? (
            <>
              <MenuItem icon={<User className="w-3.5 h-3.5 text-amber-400" />}>
                {t('menu_signed_in_as', { name: currentUser.name })}
              </MenuItem>
              <MenuItem danger icon={<LogOut className="w-3.5 h-3.5" />} onClick={() => onLogout?.()}>
                {t('set_sign_out')}
              </MenuItem>
            </>
          ) : (
            <MenuItem icon={<GoogleIcon className="w-3.5 h-3.5" />} onClick={() => onLoginGoogle?.()}>
              {t('btn_login_google')}
            </MenuItem>
          )}
        </Menu>
      </div>
    </header>
  );
};
