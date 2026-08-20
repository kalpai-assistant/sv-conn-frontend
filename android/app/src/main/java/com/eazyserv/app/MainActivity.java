package com.eazyserv.app;

import android.os.Bundle;

import com.eazyserv.apkupdater.ApkUpdaterPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // SVC-226: explicit register so the plugin is discoverable even
        // when auto-discovery via the @CapacitorPlugin annotation misses
        // it on a specific Capacitor version. Cheap belt on top of the
        // annotation's suspenders.
        registerPlugin(ApkUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
