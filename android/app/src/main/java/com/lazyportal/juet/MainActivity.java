package com.lazyportal.juet;

import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupWidgetBridge();
    }

    @Override
    public void onStart() {
        super.onStart();
        applyWebViewTheme();
        setupWidgetBridge();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyWebViewTheme();
    }

    private void setupWidgetBridge() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void updateWidget(String pct, String classes, String status, boolean isSafe) {
                    AttendanceWidgetProvider.saveAndBroadcast(MainActivity.this, pct, classes, status, isSafe);
                }
            }, "AndroidWidgetBridge");
        }
    }

    private void applyWebViewTheme() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            WebSettings settings = webView.getSettings();
            int nightModeFlags = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
            boolean isNight = nightModeFlags == Configuration.UI_MODE_NIGHT_YES;
            webView.setBackgroundColor(isNight ? 0xFF090B10 : 0xFF111620);
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && Build.VERSION.SDK_INT < 33) {
                settings.setForceDark(WebSettings.FORCE_DARK_ON);
            }
        }
    }
}


