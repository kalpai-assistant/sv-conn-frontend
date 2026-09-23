package com.eazyserv.apkupdater;

// SVC-226: In-app APK update. Keeps the user in the app while the new
// APK downloads, then hands off to Android's package installer at the
// last mile. Sits behind the existing SVC-162 nudge/block UI in the
// JS layer — this plugin is just the plumbing.
//
// Why a custom plugin instead of a community one:
//   - We ship a side-loaded APK, so Google Play Core in-app updates
//     don't apply.
//   - Community plugins (e.g. @capacitor-community/*, @capgo/*) either
//     wrap Play Core OR expect the JS bundle to be updated (not the
//     APK). Neither fits us.
//   - The scope is small (download + install) and DownloadManager +
//     FileProvider are stable Android APIs — no third-party dep.
//
// Contract with the JS layer:
//   download(url, sha256?) -> {}  ; emits `downloadProgress` and
//                                   terminal `downloadComplete` /
//                                   `downloadFailed` events
//   install()             -> {}   ; opens Android's package installer
//                                   on the most recently downloaded APK
//   canInstall()          -> { canInstall, reason? }
//   openInstallSettings() -> {}   ; deep-links to "Install unknown apps"
//                                   for our package when canInstall==false

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import android.webkit.WebView;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    // Filename we always write to. Overwrites the previous download on a
    // retry — we never keep more than one APK sitting on disk. Path is
    // <externalFilesDir>/Download/eazyserv-latest.apk and matches the
    // <external-files-path name="apk_updates" path="Download/"> entry
    // in res/xml/file_paths.xml. If either the path or the filename
    // changes, update both.
    private static final String APK_FILENAME = "eazyserv-latest.apk";

    // Progress polling cadence. DownloadManager doesn't push updates —
    // we query its content provider on a Handler tick. 500ms is fast
    // enough to feel live in the UI, slow enough that a 10MB download
    // doesn't fire 200 JS events.
    private static final long PROGRESS_POLL_MS = 500L;

    private long currentDownloadId = -1L;
    private Handler pollHandler;
    private Runnable pollRunnable;
    private BroadcastReceiver completionReceiver;

    // ---------------------------------------------------------------
    // download(url, sha256?)
    // ---------------------------------------------------------------
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        Context ctx = getContext();
        DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) {
            call.reject("DownloadManager unavailable on this device");
            return;
        }

        // If a previous download is still in flight, cancel it. Users
        // sometimes tap Update twice — don't stack downloads.
        if (currentDownloadId != -1L) {
            dm.remove(currentDownloadId);
            stopPolling();
        }

        // Delete any prior APK so a partial file from a crashed run
        // can't get picked up by install().
        File dest = new File(
            ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
            APK_FILENAME
        );
        if (dest.exists() && !dest.delete()) {
            // Not fatal — DownloadManager overwrites its destination too.
            // Log via the JS side so it shows up in Sentry with context.
        }

        DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url))
            .setTitle("EazyServ update")
            .setDescription("Downloading the latest version")
            .setDestinationInExternalFilesDir(
                ctx, Environment.DIRECTORY_DOWNLOADS, APK_FILENAME
            )
            // Hidden — the JS layer paints its own progress bar. Two
            // notifications side by side (system + in-app) would confuse
            // the user about which one to tap. Requires the
            // DOWNLOAD_WITHOUT_NOTIFICATION uses-permission in the
            // manifest; without it, enqueue() throws SecurityException
            // and — pre-this-try/catch — crashed the entire app on tap.
            // Day-0 crash, fixed in the same PR that added this comment.
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_HIDDEN)
            .setMimeType("application/vnd.android.package-archive")
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(true);

        // enqueue() can throw:
        //   - SecurityException  → missing DOWNLOAD_WITHOUT_NOTIFICATION
        //                          (the day-0 crash) or user revoked something
        //   - IllegalArgumentException → malformed URL, unreachable destination
        //   - anything else the download provider raises
        // Any uncaught throw from a @PluginMethod terminates the app process
        // via the Capacitor bridge. Catch broad, reject the PluginCall,
        // let the JS layer render its error state.
        try {
            currentDownloadId = dm.enqueue(req);
        } catch (Exception e) {
            call.reject("Download could not start: " + e.getMessage(), e);
            return;
        }
        startPolling(call);
        registerCompletionReceiver();

        // Return immediately — this is fire-and-listen. The caller
        // subscribes to `downloadProgress` / `downloadComplete` /
        // `downloadFailed` events.
        JSObject ret = new JSObject();
        ret.put("downloadId", currentDownloadId);
        call.resolve(ret);
    }

    // ---------------------------------------------------------------
    // install() — opens the package installer on the last downloaded APK.
    // Precondition: canInstall() returned canInstall=true. If it didn't,
    // the JS layer should route the user through openInstallSettings()
    // first.
    // ---------------------------------------------------------------
    @PluginMethod
    public void install(PluginCall call) {
        Context ctx = getContext();
        File apk = new File(
            ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
            APK_FILENAME
        );
        if (!apk.exists()) {
            call.reject("No downloaded APK to install. Call download() first.");
            return;
        }

        // FileProvider is the only sanctioned way to hand an APK URI to
        // another process on API 24+. authorities must match the entry
        // in AndroidManifest's <provider android:authorities="...">.
        Uri uri;
        try {
            uri = FileProvider.getUriForFile(
                ctx, ctx.getPackageName() + ".fileprovider", apk
            );
        } catch (IllegalArgumentException e) {
            call.reject(
                "FileProvider not configured for the APK path. "
                + "Check res/xml/file_paths.xml and AndroidManifest.",
                e
            );
            return;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        // SVC-315: wipe the WebView HTTP cache (and back/forward history)
        // before we hand off to the installer. Android preserves the app's
        // data dir across same-signing-key APK updates, so a cached
        // index.html referencing a Vite chunk hash the new APK doesn't
        // ship would 404 → blank WebView (SVC-313 white-screen).
        // Deliberately NOT clearing localStorage / IndexedDB — AuthProvider
        // relies on persisted tokens surviving app updates.
        // WebView methods must run on the UI thread. The install intent
        // tears down our process shortly after, so we don't wait on the
        // post — either the clear lands or the process dies with a dirty
        // cache that the new APK's cold-boot guard (MainActivity) will
        // handle on next launch.
        final WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        if (wv != null) {
            new Handler(Looper.getMainLooper()).post(() -> {
                wv.clearCache(true);
                wv.clearHistory();
            });
        }

        try {
            ctx.startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to launch package installer: " + e.getMessage(), e);
        }
    }

    // ---------------------------------------------------------------
    // canInstall() — on API 26+, the user must grant "Install unknown
    // apps" for our package. Called before install() so the JS layer
    // can route through openInstallSettings() when needed.
    // ---------------------------------------------------------------
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            // Pre-Oreo — no per-app "unknown sources" toggle. The old
            // global Settings toggle is out of scope; if a user has
            // side-loaded our APK to get here at all, they've already
            // enabled it.
            ret.put("canInstall", true);
            call.resolve(ret);
            return;
        }
        boolean ok = getContext().getPackageManager().canRequestPackageInstalls();
        ret.put("canInstall", ok);
        if (!ok) {
            ret.put("reason", "REQUEST_INSTALL_PACKAGES not granted for this app");
        }
        call.resolve(ret);
    }

    // ---------------------------------------------------------------
    // openInstallSettings() — deep-links to the "Install unknown apps"
    // screen filtered to our app. User grants the toggle + returns.
    // ---------------------------------------------------------------
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve();
            return;
        }
        Intent intent = new Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:" + getContext().getPackageName())
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    // ---------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------

    private void startPolling(final PluginCall originalCall) {
        stopPolling();
        pollHandler = new Handler(Looper.getMainLooper());
        pollRunnable = new Runnable() {
            @Override
            public void run() {
                DownloadManager dm = (DownloadManager)
                    getContext().getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm == null || currentDownloadId == -1L) return;

                Cursor cursor = dm.query(
                    new DownloadManager.Query().setFilterById(currentDownloadId)
                );
                if (cursor == null) return;
                try {
                    if (!cursor.moveToFirst()) return;
                    int statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                    int bytesIdx = cursor.getColumnIndex(
                        DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR
                    );
                    int totalIdx = cursor.getColumnIndex(
                        DownloadManager.COLUMN_TOTAL_SIZE_BYTES
                    );
                    int status = cursor.getInt(statusIdx);
                    long bytes = cursor.getLong(bytesIdx);
                    long total = cursor.getLong(totalIdx);

                    JSObject payload = new JSObject();
                    payload.put("bytes", bytes);
                    payload.put("total", total);
                    // Guard against div-by-zero when the server hasn't
                    // sent Content-Length yet. UI treats -1 as
                    // indeterminate.
                    payload.put("percent", total > 0 ? (bytes * 100.0 / total) : -1);

                    switch (status) {
                        case DownloadManager.STATUS_SUCCESSFUL:
                            payload.put("percent", 100);
                            notifyListeners("downloadProgress", payload);
                            // The completion-broadcast path emits
                            // `downloadComplete` — don't double-emit here.
                            stopPolling();
                            return;
                        case DownloadManager.STATUS_FAILED: {
                            int reasonIdx = cursor.getColumnIndex(
                                DownloadManager.COLUMN_REASON
                            );
                            int reason = cursor.getInt(reasonIdx);
                            JSObject fail = new JSObject();
                            fail.put("reason", reason);
                            fail.put(
                                "reasonText",
                                describeDownloadFailure(reason)
                            );
                            notifyListeners("downloadFailed", fail);
                            stopPolling();
                            currentDownloadId = -1L;
                            return;
                        }
                        default:
                            notifyListeners("downloadProgress", payload);
                    }
                } finally {
                    cursor.close();
                }

                // Reschedule while the download's still running.
                if (pollHandler != null) {
                    pollHandler.postDelayed(this, PROGRESS_POLL_MS);
                }
            }
        };
        pollHandler.post(pollRunnable);
    }

    private void stopPolling() {
        if (pollHandler != null && pollRunnable != null) {
            pollHandler.removeCallbacks(pollRunnable);
        }
        pollHandler = null;
        pollRunnable = null;
    }

    private void registerCompletionReceiver() {
        if (completionReceiver != null) return;
        completionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                long id = intent.getLongExtra(
                    DownloadManager.EXTRA_DOWNLOAD_ID, -1L
                );
                if (id != currentDownloadId) return;
                // Cursor query one more time to confirm success — the
                // completion broadcast fires for both SUCCESSFUL and
                // FAILED terminal states.
                DownloadManager dm = (DownloadManager)
                    ctx.getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm == null) return;
                Cursor c = dm.query(new DownloadManager.Query().setFilterById(id));
                if (c == null) return;
                try {
                    if (c.moveToFirst()) {
                        int status = c.getInt(
                            c.getColumnIndex(DownloadManager.COLUMN_STATUS)
                        );
                        if (status == DownloadManager.STATUS_SUCCESSFUL) {
                            JSObject payload = new JSObject();
                            payload.put(
                                "path",
                                new File(
                                    ctx.getExternalFilesDir(
                                        Environment.DIRECTORY_DOWNLOADS
                                    ),
                                    APK_FILENAME
                                ).getAbsolutePath()
                            );
                            notifyListeners("downloadComplete", payload);
                        }
                        // FAILED case is handled by the poller (which
                        // has richer reason info).
                    }
                } finally {
                    c.close();
                    stopPolling();
                    unregisterCompletionReceiver();
                }
            }
        };
        IntentFilter filter = new IntentFilter(
            DownloadManager.ACTION_DOWNLOAD_COMPLETE
        );
        // API 33+: broadcasts must declare exported/not-exported. This
        // one comes from the system, so RECEIVER_NOT_EXPORTED is right.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(
                completionReceiver, filter, Context.RECEIVER_EXPORTED
            );
        } else {
            getContext().registerReceiver(completionReceiver, filter);
        }
    }

    private void unregisterCompletionReceiver() {
        if (completionReceiver == null) return;
        try {
            getContext().unregisterReceiver(completionReceiver);
        } catch (IllegalArgumentException ignored) {
            // Already unregistered — bridge lifecycle can call handleOnDestroy
            // more than once in dev-reload paths.
        }
        completionReceiver = null;
    }

    @Override
    protected void handleOnDestroy() {
        stopPolling();
        unregisterCompletionReceiver();
        super.handleOnDestroy();
    }

    private static String describeDownloadFailure(int reason) {
        switch (reason) {
            case DownloadManager.ERROR_CANNOT_RESUME: return "Cannot resume";
            case DownloadManager.ERROR_DEVICE_NOT_FOUND: return "Storage not found";
            case DownloadManager.ERROR_FILE_ALREADY_EXISTS: return "File already exists";
            case DownloadManager.ERROR_FILE_ERROR: return "File error";
            case DownloadManager.ERROR_HTTP_DATA_ERROR: return "HTTP data error";
            case DownloadManager.ERROR_INSUFFICIENT_SPACE: return "Insufficient space";
            case DownloadManager.ERROR_TOO_MANY_REDIRECTS: return "Too many redirects";
            case DownloadManager.ERROR_UNHANDLED_HTTP_CODE: return "Unhandled HTTP code";
            case DownloadManager.ERROR_UNKNOWN: default: return "Unknown error";
        }
    }
}
