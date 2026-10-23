package com.bambaska.kafe;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/** Bambaşka — canlı web uygulamasını (GitHub Pages) açan ince Android kabuğu.
 *  İçerik her açılışta siteden gelir; uygulama güncellemesi gerekmez. */
public class MainActivity extends Activity {
    static final String BASE = "https://rustemakincik.github.io/Bambaska/";
    static final int REQ_CAM = 1, REQ_FILE = 2;
    WebView web;
    PermissionRequest pendingPerm;
    ValueCallback<Uri[]> fileCb;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        web.setBackgroundColor(Color.WHITE);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setUserAgentString(s.getUserAgentString() + " BambaskaApp/" + BuildConfigVersion());
        web.addJavascriptInterface(new Bridge(), "BambaskaApp");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return handle(r.getUrl()); }
            @Override public void onPageFinished(WebView v, String url) {
                // yazdır → Android yazdırma ekranı ("PDF olarak kaydet" dahil)
                v.evaluateJavascript("window.print=function(){BambaskaApp.print(document.title)};", null);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest req) {
                runOnUiThread(() -> {
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) req.grant(req.getResources());
                    else { pendingPerm = req; requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAM); }
                });
            }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try { startActivityForResult(p.createIntent(), REQ_FILE); } catch (ActivityNotFoundException e) { fileCb = null; return false; }
                return true;
            }
        });
        if (b != null) web.restoreState(b); else web.loadUrl(startUrl(getIntent()));
    }

    static String BuildConfigVersion() { return "1"; }

    String startUrl(Intent i) {
        Uri u = i == null ? null : i.getData();
        if (u == null) return BASE;
        if ("bambaska".equals(u.getScheme())) {
            // bambaska://katil/<kod>
            String path = (u.getHost() == null ? "" : u.getHost()) + (u.getPath() == null ? "" : u.getPath());
            return BASE + "index.html#/" + path;
        }
        return u.toString().startsWith(BASE) ? u.toString() : BASE;
    }

    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); if (i.getData() != null) web.loadUrl(startUrl(i)); }

    boolean handle(Uri u) {
        String url = u.toString();
        if (url.startsWith(BASE)) return false; // kendi sayfamız: WebView içinde kalsın
        try {
            Intent it = url.startsWith("intent:") ? Intent.parseUri(url, Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, u);
            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(it);
        } catch (Exception e) { Toast.makeText(this, "Açılamadı: " + url, Toast.LENGTH_SHORT).show(); }
        return true; // WhatsApp, telefon, harita… dış uygulamada
    }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code == REQ_CAM && pendingPerm != null) {
            if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) pendingPerm.grant(pendingPerm.getResources()); else pendingPerm.deny();
            pendingPerm = null;
        }
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        if (code == REQ_FILE && fileCb != null) { fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data)); fileCb = null; return; }
        super.onActivityResult(code, result, data);
    }

    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); web.saveState(o); }

    class Bridge {
        @JavascriptInterface public void share(String title, String text) {
            Intent i = new Intent(Intent.ACTION_SEND); i.setType("text/plain");
            i.putExtra(Intent.EXTRA_SUBJECT, title); i.putExtra(Intent.EXTRA_TEXT, text);
            startActivity(Intent.createChooser(i, title));
        }
        @JavascriptInterface public void copy(String text) {
            ((ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Bambaşka", text));
        }
        @JavascriptInterface public void print(String title) {
            runOnUiThread(() -> {
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                String name = (title == null || title.isEmpty()) ? "Bambaska" : title;
                pm.print(name, web.createPrintDocumentAdapter(name), new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            });
        }
        @JavascriptInterface public String version() { return BuildConfigVersion(); }
    }
}
