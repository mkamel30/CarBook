'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Account identity for the workbench shell (A5). The shell hands a bearer over
 * via deep link AFTER mount, so loadAuth is re-invoked by the 'carbook:handoff'
 * listener in the page, not only at mount.
 */
export function useAuth() {
  const [currentUser, setCurrentUser] = useState<any | null>(null);

  const loadAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      setCurrentUser(data.authenticated ? data.user : null);
    } catch {
      // A transient /api/auth/me failure must not flip the user to signed-out.
    }
  }, []);

  useEffect(() => {
    loadAuth();
  }, [loadAuth]);

  const handleLoginGoogle = useCallback(() => {
    // Bundled APK: the shell opens the SERVER login URL in the external browser
    // (Google refuses embedded WebViews); the deep link returns with a code.
    const shell = typeof window !== 'undefined'
      ? (window as { carbookShell?: { openLogin?: () => void } }).carbookShell
      : undefined;
    if (shell?.openLogin) {
      shell.openLogin();
      return;
    }
    window.location.href = '/api/auth/login';
  }, []);

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    // Bundled APK: drop the stored account bearer too, or the next boot would
    // re-attach a revoked credential.
    (window as { carbookShell?: { clearSession?: () => void } }).carbookShell?.clearSession?.();
    setCurrentUser(null);
    window.location.reload();
  }, []);

  return { currentUser, loadAuth, handleLoginGoogle, handleLogout };
}
