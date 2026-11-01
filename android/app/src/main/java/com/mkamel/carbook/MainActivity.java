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
            String token = uri.getQueryParameter("token");
            if (token != null && !token.trim().isEmpty()) {
                String targetUrl = "https://carbook.141.147.136.170.sslip.io/api/auth/token-login?token=" + Uri.encode(token);
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().post(() -> {
                        getBridge().getWebView().loadUrl(targetUrl);
                    });
                }
            }
        }
    }
}

