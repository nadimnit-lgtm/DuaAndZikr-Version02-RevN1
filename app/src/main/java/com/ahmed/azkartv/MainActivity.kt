package com.ahmed.azkartv

import android.annotation.SuppressLint
import android.app.UiModeManager
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Bundle
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader

/**
 * Single-activity host for the bundled offline reading interface.
 *
 * Assets are served through [WebViewAssetLoader] over the secure
 * https://appassets.androidplatform.net origin. This lets the page use normal
 * fetch() for the packaged JSON while every file-system access flag stays
 * disabled, which is the recommended secure configuration for local content.
 *
 * On Android TV / Google TV the page is loaded with `?tv=1` so the web layer
 * can switch to its leanback-friendly layout (large text, D-pad focus rings).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    private fun isTelevision(): Boolean {
        val ui = getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
        return ui?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep the display awake while this reading app is open on phone, tablet and TV.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            // The web layer owns all D-pad handling; let key events reach it.
            isFocusable = true
            isFocusableInTouchMode = true
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true                 // settings + last position
                // Hardened: no file-system reach from the web layer.
                allowFileAccess = false
                allowContentAccess = false
                @Suppress("DEPRECATION")
                allowFileAccessFromFileURLs = false
                @Suppress("DEPRECATION")
                allowUniversalAccessFromFileURLs = false
                loadWithOverviewMode = true
                useWideViewPort = true
                mediaPlaybackRequiresUserGesture = true
                cacheMode = WebSettings.LOAD_DEFAULT
                // Online prayer lookups are HTTPS only.
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                // Allow the web layer to request device location for global
                // prayer times. Coordinates never leave the device except to
                // the public prayer-time API; the web layer degrades to a
                // network/IP estimate when GPS permission is unavailable.
                setGeolocationEnabled(true)
            }
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView, request: WebResourceRequest
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)
            }
            // Grant geolocation to the bundled (trusted) asset origin only.
            // The actual OS-level permission is still gated by the runtime
            // request below; if the user/device denies it, the web layer
            // automatically falls back to a network/IP location estimate.
            webChromeClient = object : WebChromeClient() {
                override fun onGeolocationPermissionsShowPrompt(
                    origin: String, callback: GeolocationPermissions.Callback
                ) {
                    val granted = ContextCompat.checkSelfPermission(
                        this@MainActivity, android.Manifest.permission.ACCESS_COARSE_LOCATION
                    ) == PackageManager.PERMISSION_GRANTED
                    callback.invoke(origin, granted, false)
                }
            }
        }

        setContentView(webView)

        // Best-effort: ask once for coarse location so automatic prayer-time
        // detection can use GPS/network where available. Denial is fine — the
        // web layer falls back to an IP-based estimate.
        if (ContextCompat.checkSelfPermission(
                this, android.Manifest.permission.ACCESS_COARSE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this, arrayOf(android.Manifest.permission.ACCESS_COARSE_LOCATION), 1001
            )
        }

        val base = "https://appassets.androidplatform.net/assets/index.html"
        val url = if (isTelevision()) "$base?tv=1" else base
        webView.loadUrl(url)
        webView.requestFocus()

        // Let the page consume Back first (e.g. to close an open sheet),
        // otherwise fall through to the system default.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript(
                    "(window.onTvBack && window.onTvBack()) ? 'true' : 'false'"
                ) { result ->
                    if (result != "\"true\"" && result != "true") {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                    }
                }
            }
        })
    }

    override fun onResume() {
        super.onResume()
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    override fun onPause() {
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        super.onPause()
    }

    override fun onDestroy() {
        if (this::webView.isInitialized) {
            (webView.parent as? ViewGroup)?.removeView(webView)
            webView.destroy()
        }
        super.onDestroy()
    }
}
