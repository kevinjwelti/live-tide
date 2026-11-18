package com.kevinjwelti.livetide

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private lateinit var reconnect: View
    private lateinit var stage: View
    private val handler = Handler(Looper.getMainLooper())
    private val startedAt = SystemClock.uptimeMillis()
    private var pageReady = false
    private var failures = 0
    private var cacheArmed = false

    private val retry = Runnable {
        if (!pageReady) web.loadUrl(HOME)
    }

    private val drift = object : Runnable {
        override fun run() {
            val seconds = (SystemClock.uptimeMillis() - startedAt) / 1000.0
            stage.translationX = (sin(seconds / 150.0) * DRIFT_PX).toFloat()
            stage.translationY = (cos(seconds / 190.0) * DRIFT_PX).toFloat()
            handler.postDelayed(this, DRIFT_EVERY_MS)
        }
    }

    private val backCallback = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            if (!pageReady) {
                finish()
                return
            }
            web.evaluateJavascript(BACK_JS) { raw ->
                if (raw != "true") finish()
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()

        stage = findViewById(R.id.root)
        web = findViewById(R.id.web)
        reconnect = findViewById(R.id.reconnect)
        stage.scaleX = 1.02f
        stage.scaleY = 1.02f

        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
        web.setBackgroundColor(0xFF000000.toInt())
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = if (online()) WebSettings.LOAD_DEFAULT else WebSettings.LOAD_CACHE_ELSE_NETWORK
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            loadsImagesAutomatically = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            allowFileAccess = false
            allowContentAccess = false
        }
        web.webViewClient = client
        web.setOnKeyListener { _, keyCode, event -> forward(keyCode, event) }
        web.requestFocus()

        onBackPressedDispatcher.addCallback(this, backCallback)
        listenForNetwork()
        handler.post(drift)
        showReconnect()
        web.loadUrl(HOME)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        web.destroy()
        super.onDestroy()
    }

    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    private val client = object : WebViewClient() {
        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
            pageReady = false
        }

        override fun onPageFinished(view: WebView?, url: String?) {
            if (view?.progress != 100) return
            pageReady = true
            failures = 0
            handler.removeCallbacks(retry)
            reconnect.visibility = View.GONE
            web.requestFocus()
            if (!cacheArmed && url?.contains("tv=1") == true) {
                cacheArmed = true
                web.evaluateJavascript(CACHE_ONCE_JS, null)
            }
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) fail()
        }

        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) {
            if (request.isForMainFrame && errorResponse.statusCode >= 500) fail()
        }
    }

    private fun fail() {
        pageReady = false
        showReconnect()
        failures += 1
        handler.removeCallbacks(retry)
        val delay = min(30_000L, 3_000L shl min(failures, 3))
        handler.postDelayed(retry, delay)
    }

    private fun showReconnect() {
        reconnect.visibility = View.VISIBLE
    }

    private fun online(): Boolean {
        val manager = getSystemService(ConnectivityManager::class.java) ?: return true
        val network = manager.activeNetwork ?: return false
        val caps = manager.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun listenForNetwork() {
        val manager = getSystemService(ConnectivityManager::class.java) ?: return
        manager.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                if (!pageReady) handler.post { web.loadUrl(HOME) }
            }
        })
    }

    private fun forward(keyCode: Int, event: KeyEvent): Boolean {
        if (event.action != KeyEvent.ACTION_DOWN) return false
        if (event.repeatCount > 0 && keyCode != KeyEvent.KEYCODE_DPAD_CENTER) return true
        val name = when (keyCode) {
            KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
            KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
            KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
            KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> "Enter"
            else -> return false
        }
        web.evaluateJavascript("window.__liveTideKey && window.__liveTideKey(${org.json.JSONObject.quote(name)})", null)
        return true
    }

    companion object {
        private const val HOME = "https://kevinjwelti.github.io/live-tide/?kiosk&tv=1"
        private const val DRIFT_PX = 4.0
        private const val DRIFT_EVERY_MS = 20_000L
        private const val BACK_JS =
            "(function(){try{return !!(window.__liveTideBack&&window.__liveTideBack());}catch(e){return false;}})()"
        private val CACHE_ONCE_JS = """
            (function(){
              try {
                if (!navigator.serviceWorker || localStorage.getItem('lt-tv-cached') === '1') return;
                navigator.serviceWorker.ready.then(function(){
                  if (localStorage.getItem('lt-tv-cached') === '1') return;
                  localStorage.setItem('lt-tv-cached', '1');
                  location.reload();
                });
              } catch (e) {}
            })();
        """.trimIndent()
    }
}
