import React from 'react';
import { Bell, Fuel, Globe, LogOut, Settings, User, Wrench } from 'lucide-react';
import { useTranslation } from '@/i18n/context';
import { Menu, MenuItem } from '@/components/ui/Menu';
import { GoogleIcon } from '@/components/ui/GoogleIcon';

export interface DesktopHeaderProps {
  selectedVehicle: any | null;
  onOpenAddFuel: () => void;
  onOpenAddMaintenance: () => void;
  currentUser?: { id: string; email: string; name: string; picture: string | null } | null;
  onLoginGoogle?: () => void;
  onLogout?: () => void;
  urgentCount?: number;
  onSelectTab?: (tab: any) => void;
}

export const DesktopHeader: React.FC<DesktopHeaderProps> = ({
  selectedVehicle,
  onOpenAddFuel,
  onOpenAddMaintenance,
  currentUser,
  onLoginGoogle,
  onLogout,
  urgentCount = 0,
  onSelectTab,
}) => {
  const { t, dir, lang, setLang, languages } = useTranslation();
  // The trigger shows the ENDONYM of the active language; the list below is the
  // context `languages` array, so a fourth language appears automatically.
  const currentName = languages.find((l: { code: string; name: string }) => l.code === lang)?.name ?? lang;

  return (
    <header className="hidden md:flex h-14 border-b border-slate-800 bg-slate-950/60 px-6 items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-4 min-w-0">
        {selectedVehicle ? (
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-semibold text-sm truncate">{selectedVehicle.name}</span>
            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
              {selectedVehicle.make} {selectedVehicle.model} ({selectedVehicle.year})
            </span>
            {selectedVehicle.licensePlate && (
              <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded font-mono">
                {selectedVehicle.licensePlate}
              </span>
            )}
            <div
              className={`text-xs text-slate-400 flex items-center gap-1 ${
                dir === 'rtl' ? 'border-r pr-3 mr-3' : 'border-l pl-3 ml-3'
              } border-slate-800`}
            >
              <span>{t('header_odometer')}</span>
              <span className="font-bold text-amber-400 font-mono">
                {selectedVehicle.currentOdometer?.toLocaleString()} {t('unit_km')}
              </span>
            </div>
          </div>
        ) : (
          <span className="text-xs text-slate-400">{t('app_select_prompt')}</span>
        )}
      </div>

      {/* Utility cluster first (alerts, language, settings), then the quick-add
          actions, and the account control last. */}
      <div className="flex items-center gap-2 shrink-0">
        {onSelectTab && (
          <button
            onClick={() => onSelectTab('alerts')}
            className="relative p-1.5 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition"
            title={t('nav_alerts')}
            aria-label={t('nav_alerts')}
          >
            <Bell className="w-3.5 h-3.5 text-amber-400" />
            {urgentCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                {urgentCount}
              </span>
            )}
          </button>
        )}

        <Menu
          triggerLabel={t('lang_menu_title')}
          ariaLabel={t('aria_language_menu')}
          title={t('lang_menu_title')}
          hint={t('lang_menu_hint')}
          align="end"
          triggerClassName="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          triggerContent={
            <>
              <Globe className="w-3.5 h-3.5 text-amber-400" />
              <span>{currentName}</span>
            </>
          }
        >
          {languages.map((l: { code: string; name: string }) => (
            <MenuItem key={l.code} selected={l.code === lang} onClick={() => setLang(l.code)}>
              {l.name}
            </MenuItem>
          ))}
        </Menu>

        {onSelectTab && (
          <button
            onClick={() => onSelectTab('settings')}
            className="p-1.5 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition"
            title={t('nav_settings')}
            aria-label={t('nav_settings')}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}

        {selectedVehicle && (
          <>
            <button
              onClick={onOpenAddFuel}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition"
            >
              <Fuel className="w-3.5 h-3.5" /> {t('btn_add_fuel')}
            </button>
            <button
              onClick={onOpenAddMaintenance}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-1.5 rounded text-xs flex items-center gap-1.5 border border-slate-700 transition"
            >
              <Wrench className="w-3.5 h-3.5" /> {t('btn_add_maintenance')}
            </button>
          </>
        )}

        <Menu
          triggerLabel={t('aria_open_menu')}
          ariaLabel={t('nav_account')}
          title={t('nav_account')}
          align="end"
          triggerClassName="flex items-center gap-2 rounded-full p-0.5 hover:bg-slate-800/70 transition active:scale-95"
          triggerContent={
            currentUser?.picture ? (
              <img src={currentUser.picture} alt={currentUser.name} className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <span className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center">
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
