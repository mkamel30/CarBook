package com.mkamel.carbook;

import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native update installer for the self-hosted APK channel.
 *
 * Before this plugin the update path was Browser.open(apkUrl): the system browser
 * owned the download, so there was no in-app progress, no completion signal, nothing
 * verified the bytes that actually landed on disk, and the user had to hunt for the
 * file in the notification shade to install it. Here the download goes through
 * DownloadManager into the app's own external files dir, is hashed with SHA-256
 * against the digest the server advertised, and is handed to the package installer
 * as a content:// URI (a file:// URI throws FileUriExposedException on API 24+).
 *
 * The user still confirms the install: silent install is a system-app privilege, so
 * the last step is always the platform dialog.
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdater extends Plugin {

    /** Subdirectory of getExternalFilesDir(null) that file_paths.xml exposes. */
    private static final String SUBDIR = "updates";
    private static final long POLL_INTERVAL_MS = 500L;
    /** Bounded wait: a stalled download is cancelled rather than polled forever. */
    private static final long DEADLINE_MS = 15L * 60L * 1000L;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService hashExecutor = Executors.newSingleThreadExecutor();

    private long activeDownloadId = -1L;
    private PluginCall pendingCall;
    private long startedAt;
    private String activeFileName;
    private String expectedSha256;
    private boolean autoInstall;

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("url must be an http(s) URL", "BAD_URL");
            return;
        }
        if (activeDownloadId != -1L) {
            call.reject("a download is already in progress", "BUSY");
            return;
        }

        Context context = getContext();
        File dir = new File(context.getExternalFilesDir(null), SUBDIR);
        if (!dir.isDirectory() && !dir.mkdirs()) {
            call.reject("could not create the update directory", "DIR_UNAVAILABLE");
            return;
        }
        String fileName = safeFileName(call.getString("fileName"), url);
        File target = new File(dir, fileName);
        // A half-written file from a killed download would hash wrong forever.
        if (target.exists() && !target.delete()) {
            call.reject("could not clear the previous download", "STALE_FILE");
            return;
        }

        DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("DownloadManager is unavailable", "NO_DOWNLOAD_MANAGER");
            return;
        }

        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setDestinationInExternalFilesDir(context, null, SUBDIR + "/" + fileName);
        request.setMimeType("application/vnd.android.package-archive");
        request.setTitle(fileName);
        request.setDescription("CarBook update");
        // Shade notification with progress plus a tappable completion notification:
        // the in-app prompt is not the only route back to the installer.
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);

        expectedSha256 = normalizeSha(call.getString("expectedSha256"));
        autoInstall = call.getBoolean("autoInstall", true);
        activeFileName = fileName;
        startedAt = System.currentTimeMillis();
        activeDownloadId = manager.enqueue(request);

        call.setKeepAlive(true);
        pendingCall = call;
        emit(progressObject(0, 0L, "queued"));
        mainHandler.postDelayed(tick, POLL_INTERVAL_MS);
    }

    /**
     * Opens the per-app "install unknown apps" screen. Meaningful on API 26+ only;
     * the JS layer reads canRequestInstall() first and keeps the browser handoff as
     * the fallback on anything older or wherever the screen does not exist.
     */
    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.reject("not required before Android 8", "LEGACY_ANDROID");
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.fromParts("package", getContext().getPackageName(), null));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("could not open the install-permission screen", "SETTINGS_UNAVAILABLE", e);
        }
    }

    @PluginMethod
    public void canRequestInstall(PluginCall call) {
        JSObject data = new JSObject();
        data.put("allowed", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && getContext().getPackageManager().canRequestPackageInstalls());
        data.put("needsPermission", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O);
        call.resolve(data);
    }

    private final Runnable tick = this::pollDownload;

    private void pollDownload() {
        PluginCall call = pendingCall;
        if (call == null || activeDownloadId == -1L) return;

        if (System.currentTimeMillis() - startedAt > DEADLINE_MS) {
            cancelActive();
            pendingCall = null;
            emit(phaseObject("failed"));
            call.reject("the download did not finish in time", "DOWNLOAD_TIMEOUT");
            return;
        }

        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            fail("NO_DOWNLOAD_MANAGER", "DownloadManager disappeared");
            return;
        }

        int status;
        int reason;
        long soFar;
        long total;
        Cursor cursor = null;
        try {
            cursor = manager.query(new DownloadManager.Query().setFilterById(activeDownloadId));
            if (cursor == null || !cursor.moveToFirst()) {
                fail("DOWNLOAD_LOST", "the system no longer tracks this download");
                return;
            }
            status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            soFar = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
        } catch (Exception e) {
            fail("DOWNLOAD_QUERY_FAILED", "could not read download status: " + e.getMessage());
            return;
        } finally {
            if (cursor != null) cursor.close();
        }

        if (total < 0) total = 0L;
        int percent = total > 0 ? (int) Math.min(100L, soFar * 100L / total) : 0;

        if (status == DownloadManager.STATUS_SUCCESSFUL) {
            activeDownloadId = -1L;
            emit(progressObject(100, total, "verifying"));
            File file = new File(new File(getContext().getExternalFilesDir(null), SUBDIR), activeFileName);
            verifyThenInstall(call, file);
            return;
        }
        if (status == DownloadManager.STATUS_FAILED) {
            activeDownloadId = -1L;
            pendingCall = null;
            JSObject data = progressObject(percent, total, "failed");
            data.put("reason", reason);
            emit(data);
            call.reject("download failed (system reason " + reason + ")", "DOWNLOAD_FAILED", data);
            return;
        }

        emit(progressObject(percent, total,
                status == DownloadManager.STATUS_PAUSED ? "paused" : "downloading"));
        mainHandler.postDelayed(tick, POLL_INTERVAL_MS);
    }

    /**
     * Hashes the downloaded bytes off the main thread, then installs. An advertised
     * digest that does not match is a hard refusal and the file is removed: the asset
     * is not what the release published, so it must not reach the installer.
     */
    private void verifyThenInstall(PluginCall call, File file) {
        final String expected = expectedSha256;
        final boolean shouldInstall = autoInstall;
        hashExecutor.execute(() -> {
            String actual;
            try {
                actual = sha256Hex(file);
            } catch (Exception e) {
                mainHandler.post(() -> fail("HASH_FAILED",
                        "could not read the downloaded file: " + e.getMessage()));
                return;
            }
            if (expected != null && !expected.equals(actual)) {
                deleteQuietly(file);
                mainHandler.post(() -> fail("SHA256_MISMATCH",
                        "the downloaded APK does not match the published digest"));
                return;
            }
            mainHandler.post(() -> finishInstall(call, file, actual, expected != null, shouldInstall));
        });
    }

    private void finishInstall(PluginCall call, File file, String sha256, boolean verified, boolean shouldInstall) {
        JSObject data = new JSObject();
        data.put("phase", shouldInstall ? "install_prompt" : "downloaded");
        data.put("path", file.getAbsolutePath());
        data.put("fileName", file.getName());
        data.put("sizeBytes", file.length());
        data.put("sha256", sha256);
        data.put("verified", verified);

        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || getContext().getPackageManager().canRequestPackageInstalls();
        data.put("canInstall", allowed);

        if (shouldInstall && allowed) {
            try {
                launchInstaller(file);
                data.put("installLaunched", true);
            } catch (Exception e) {
                data.put("installLaunched", false);
                data.put("installError", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            }
        } else {
            data.put("installLaunched", false);
        }

        pendingCall = null;
        emit(data);
        call.resolve(data);
    }

    /**
     * ACTION_VIEW with a content:// URI is the documented route. Some OEM builds only
     * answer ACTION_INSTALL_PACKAGE, so a refusal there is retried once with the
     * installer-specific action instead of silently dropping the update.
     */
    private void launchInstaller(File file) {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(uri, "application/vnd.android.package-archive");
        view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(view);
            return;
        } catch (ActivityNotFoundException ignored) {
            // fall through to the explicit installer action
        }
        Intent install = new Intent(Intent.ACTION_INSTALL_PACKAGE);
        install.setData(uri);
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        install.putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true);
        getContext().startActivity(install);
    }

    private void fail(String code, String message) {
        PluginCall call = pendingCall;
        pendingCall = null;
        activeDownloadId = -1L;
        JSObject data = phaseObject("failed");
        emit(data);
        if (call != null) call.reject(message, code, data);
    }

    private void cancelActive() {
        if (activeDownloadId == -1L) return;
        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager != null) manager.remove(activeDownloadId);
        activeDownloadId = -1L;
    }

    private void emit(JSObject data) {
        notifyListeners("progress", data);
    }

    private static JSObject phaseObject(String phase) {
        JSObject data = new JSObject();
        data.put("phase", phase);
        return data;
    }

    private static JSObject progressObject(int percent, long totalBytes, String phase) {
        JSObject data = phaseObject(phase);
        data.put("percent", percent);
        data.put("totalBytes", totalBytes);
        return data;
    }

    private static String normalizeSha(String value) {
        if (value == null) return null;
        String hex = value.replace("sha256:", "").trim().toLowerCase(Locale.ROOT);
        return hex.matches("^[0-9a-f]{64}$") ? hex : null;
    }

    /** Only ever a plain file name: the caller cannot steer the path. */
    private static String safeFileName(String provided, String url) {
        String candidate = provided;
        if (candidate == null || candidate.isEmpty()) {
            String tail = url.replaceAll("[?#].*$", "");
            int slash = tail.lastIndexOf('/');
            candidate = slash >= 0 ? tail.substring(slash + 1) : "";
        }
        candidate = candidate.replaceAll("[^A-Za-z0-9._-]", "_");
        if (candidate.isEmpty() || candidate.equals(".") || candidate.equals("..")) candidate = "carbook-update.apk";
        if (!candidate.toLowerCase(Locale.ROOT).endsWith(".apk")) candidate = candidate + ".apk";
        return candidate;
    }

    private static String sha256Hex(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[64 * 1024];
        try (InputStream in = new FileInputStream(file)) {
            int read;
            while ((read = in.read(buffer)) > 0) digest.update(buffer, 0, read);
        }
        StringBuilder sb = new StringBuilder(64);
        for (byte b : digest.digest()) sb.append(String.format(Locale.ROOT, "%02x", b));
        return sb.toString();
    }

    private static void deleteQuietly(File file) {
        try {
            if (file.exists()) file.delete();
        } catch (Exception ignored) {
            // nothing useful to do; the next download clears the path again
        }
    }

    @Override
    protected void handleOnDestroy() {
        mainHandler.removeCallbacks(tick);
        cancelActive();
        if (pendingCall != null) {
            PluginCall call = pendingCall;
            pendingCall = null;
            call.reject("the app was closed mid-download", "DESTROYED");
        }
    }
}
