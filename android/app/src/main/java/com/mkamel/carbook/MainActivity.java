package com.mkamel.carbook;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
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
        if (uri != null && "carbook".equalsIgnoreCase(uri.getScheme())) {
            // Preferred: single-use authorization code (Slice 4). Legacy durable
            // ?token= is still accepted for ~30 days server-side for old installs.
            String code = uri.getQueryParameter("code");
            String queryParam = (code != null && !code.trim().isEmpty())
                    ? "code=" + Uri.encode(code)
                    : null;
            if (queryParam == null) {
                String token = uri.getQueryParameter("token");
                if (token != null && !token.trim().isEmpty()) {
                    queryParam = "token=" + Uri.encode(token);
                }
            }
            if (queryParam != null) {
                // Server origin is a string resource in res/values/config.xml.
                // To point the APK at a different backend, edit that resource and rebuild;
                // do NOT hardcode the host here.
                String serverUrl = getString(R.string.server_url).replaceAll("/+$", "");
                String targetUrl = serverUrl + "/api/auth/token-login?" + queryParam;
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().post(() -> {
                        getBridge().getWebView().loadUrl(targetUrl);
                    });
                }
            }
        }
    }
}

