package com.mkamel.carbook;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // App-local plugins must be registered before the bridge is built.
        registerPlugin(ApkUpdater.class);
        // Applies postSplashScreenTheme once the branded splash dismisses.
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        handleAuthIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleAuthIntent(intent);
    }

    private void handleAuthIntent(Intent intent) {
        if (intent == null) return;
        Uri uri = intent.getData();
        if (uri == null) return;

        String code = null;
        String legacyToken = null;
        if ("carbook".equalsIgnoreCase(uri.getScheme())) {
            code = uri.getQueryParameter("code");
            legacyToken = uri.getQueryParameter("token");
        } else if ("https".equalsIgnoreCase(uri.getScheme())
                && uri.getPath() != null && uri.getPath().startsWith("/app-login")) {
            // Verified App Link: the OAuth callback redirected the browser here
            // and Android handed the URL to us instead of rendering the page.
            code = uri.getQueryParameter("code");
        } else {
            return;
        }

        if (code != null && !code.trim().isEmpty()) {
            // The bundled app redeems the single-use code itself
            // (offline/authBridge.ts): reload the LOCAL shell with ?auth_code= so
            // the boot handoff can POST it to /api/auth/token-login and store the
            // bearer. Loading the server URL here instead would drop a
            // server-origin cookie the local origin can never send.
            loadInWebView("https://localhost/?auth_code=" + Uri.encode(code));
            return;
        }

        // Legacy durable ?token= (accepted for ~30 days server-side for old
        // installs): cookie flow via the server origin, as before.
        if (legacyToken != null && !legacyToken.trim().isEmpty()) {
            String serverUrl = getString(R.string.server_url).replaceAll("/+$", "");
            loadInWebView(serverUrl + "/api/auth/token-login?token=" + Uri.encode(legacyToken));
        }
    }

    private void loadInWebView(String url) {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() -> {
                getBridge().getWebView().loadUrl(url);
            });
        }
    }
}

