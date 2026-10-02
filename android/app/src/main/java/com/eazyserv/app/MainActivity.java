package com.eazyserv.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;

import com.eazyserv.apkupdater.ApkUpdaterPlugin;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "EazyservMainActivity";

    // SVC-315: SharedPreferences key that stores the versionCode we last
    // successfully booted with. If the current versionCode differs, the
    // APK was replaced between runs and we wipe the WebView HTTP cache
    // once to avoid the SVC-313 stale-chunk white-screen. The in-app
    // updater (ApkUpdaterPlugin.install) also clears on its way to the
    // installer; this handler is the belt-and-braces for installs that
    // bypass us — adb sideload today, Play Store rollout later.
    private static final String PREFS = "eazyserv_native";
    private static final String KEY_LAST_BOOT_VERSION_CODE = "last_boot_version_code";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // SVC-226: explicit register so the plugin is discoverable even
        // when auto-discovery via the @CapacitorPlugin annotation misses
        // it on a specific Capacitor version. Cheap belt on top of the
        // annotation's suspenders.
        registerPlugin(ApkUpdaterPlugin.class);
        super.onCreate(savedInstanceState);

        maybeClearWebViewCacheOnVersionChange();
        installIntentUrlHandler();
    }

    // RBI's new rules (2026-10) deprecate the UPI Collect flow in Android
    // WebView; Razorpay's Standard Checkout now generates intent:// and
    // upi:// URLs that must be launched as Android intents so GPay / PhonePe
    // / Paytm can handle them. Capacitor's default BridgeWebViewClient
    // drops non-http(s) URLs silently, so without this override UPI payment
    // apps never open and UPI vanishes from the checkout UI.
    //
    // We extend BridgeWebViewClient rather than replace it so every other
    // Capacitor behaviour (allowed origins, bridge messaging, cookie
    // forwarding) stays intact; only non-http(s) navigation is intercepted.
    //
    // The AndroidManifest <queries> block is the companion to this — on
    // Android 11+ targetSdk 30+, the app cannot see UPI-handling packages
    // without it, so startActivity would throw ActivityNotFoundException.
    private void installIntentUrlHandler() {
        new Handler(Looper.getMainLooper()).post(() -> {
            if (getBridge() == null) return;
            WebView wv = getBridge().getWebView();
            if (wv == null) return;
            wv.setWebViewClient(new BridgeWebViewClient(getBridge()) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    String url = request.getUrl().toString();
                    boolean isWeb = url.startsWith("http://") || url.startsWith("https://");
                    if (!isWeb) {
                        try {
                            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                            // FLAG_ACTIVITY_NEW_TASK so UPI apps start cleanly
                            // outside our task stack and return via onNewIntent
                            // when the user comes back.
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(intent);
                            return true;
                        } catch (ActivityNotFoundException e) {
                            Log.w(TAG, "No app can handle " + url, e);
                            // Let the WebView see the URL — it will show its
                            // default error page rather than failing silently.
                            return false;
                        }
                    }
                    return super.shouldOverrideUrlLoading(view, request);
                }
            });
        });
    }

    private void maybeClearWebViewCacheOnVersionChange() {
        int current = readCurrentVersionCode();
        if (current == -1) return;

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        int last = prefs.getInt(KEY_LAST_BOOT_VERSION_CODE, -1);
        if (last == current) return;

        Log.i(TAG, "versionCode changed " + last + " -> " + current
            + "; clearing WebView cache once");

        // Bridge/WebView isn't ready in onCreate before super has spun
        // it up; post to the main looper so we clear after Capacitor's
        // bridge has attached its WebView. WebView methods are
        // main-thread only.
        new Handler(Looper.getMainLooper()).post(() -> {
            WebView wv = getBridge() != null ? getBridge().getWebView() : null;
            if (wv != null) {
                wv.clearCache(true);
            }
        });

        prefs.edit().putInt(KEY_LAST_BOOT_VERSION_CODE, current).apply();
    }

    private int readCurrentVersionCode() {
        try {
            PackageManager pm = getPackageManager();
            PackageInfo info = pm.getPackageInfo(getPackageName(), 0);
            // versionCode (legacy field) — longVersionCode requires API 28+;
            // our minSdk is 24. Fine as long as we stay monotonic +1 per release.
            return info.versionCode;
        } catch (PackageManager.NameNotFoundException e) {
            // Our own package must exist — treat as unknown and skip the
            // clear so we never brick boot on a lookup miss.
            Log.w(TAG, "Could not read own PackageInfo", e);
            return -1;
        }
    }
}
