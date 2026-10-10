package com.excalisidian.app

import android.content.res.Configuration
import android.os.Bundle
import android.util.Log
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

class MainActivity : TauriActivity() {
  private var webView: WebView? = null
  private var replyProxy: JavaScriptReplyProxy? = null
  private var temaEscuro: Boolean? = null
  private var insetsCssPx = CssInsets(0.0, 0.0, 0.0, 0.0)

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    atualizarAparenciaBarras()
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView

    if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
      Log.e(TAG, "O WebView instalado não suporta a ponte segura de tema e insets.")
      return
    }

    WebViewCompat.addWebMessageListener(
      webView,
      BRIDGE_NAME,
      setOf(APP_ORIGIN),
    ) { _, message, sourceOrigin, isMainFrame, proxy ->
      if (!isMainFrame || sourceOrigin.toString() != APP_ORIGIN) return@addWebMessageListener
      processarMensagem(message, proxy)
    }

    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, windowInsets ->
      val safeArea = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
      )
      insetsCssPx = safeArea.paraCssPx(view.resources.displayMetrics.density)
      replyProxy?.let(::enviarInsets)
      windowInsets
    }
    solicitarInsets()
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    atualizarAparenciaBarras()
    solicitarInsets()
  }

  override fun onResume() {
    super.onResume()
    atualizarAparenciaBarras()
    solicitarInsets()
  }

  override fun onDestroy() {
    replyProxy = null
    webView = null
    super.onDestroy()
  }

  private fun processarMensagem(message: WebMessageCompat, proxy: JavaScriptReplyProxy) {
    val payload = message.data ?: return
    val data = runCatching { JSONObject(payload) }.getOrNull() ?: return
    when (data.optString("type")) {
      "ready" -> {
        if (data.length() != 1) return
        replyProxy = proxy
        enviarInsets(proxy)
      }
      "theme" -> {
        if (data.length() != 2) return
        val escuro = data.opt("dark") as? Boolean ?: return
        temaEscuro = escuro
        atualizarAparenciaBarras(escuro)
      }
    }
  }

  private fun enviarInsets(proxy: JavaScriptReplyProxy) {
    proxy.postMessage(
      JSONObject()
        .put("type", "insets")
        .put("top", insetsCssPx.top)
        .put("right", insetsCssPx.right)
        .put("bottom", insetsCssPx.bottom)
        .put("left", insetsCssPx.left)
        .toString(),
    )
  }

  private fun atualizarAparenciaBarras(escuro: Boolean? = temaEscuro) {
    val temaEscuroEfetivo = escuro ?: (
      (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
        Configuration.UI_MODE_NIGHT_YES
      )
    val controller = WindowInsetsControllerCompat(window, window.decorView)
    controller.isAppearanceLightStatusBars = !temaEscuroEfetivo
    controller.isAppearanceLightNavigationBars = !temaEscuroEfetivo
  }

  private fun solicitarInsets() {
    webView?.let { current ->
      current.post { ViewCompat.requestApplyInsets(current) }
    }
  }

  private data class CssInsets(val top: Double, val right: Double, val bottom: Double, val left: Double)

  private fun Insets.paraCssPx(density: Float): CssInsets {
    val safeDensity = density.takeIf { it > 0f } ?: 1f
    return CssInsets(
      top = top.toDouble() / safeDensity,
      right = right.toDouble() / safeDensity,
      bottom = bottom.toDouble() / safeDensity,
      left = left.toDouble() / safeDensity,
    )
  }

  private companion object {
    const val TAG = "ExcalisidianSystemUi"
    const val APP_ORIGIN = "http://tauri.localhost"
    const val BRIDGE_NAME = "ExcalisidianSystemUi"
  }
}
