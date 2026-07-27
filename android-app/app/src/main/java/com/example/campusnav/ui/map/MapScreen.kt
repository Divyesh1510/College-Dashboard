package com.example.campusnav.ui.map

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.view.ViewGroup
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.launch

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MapScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var urlToLoad by remember { mutableStateOf<String?>(null) }
    var errorMsg by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()
    
    var hasLocationPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        hasLocationPermission = permissions.entries.any { it.value }
    }

    LaunchedEffect(Unit) {
        if (!hasLocationPermission) {
            permissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
        }
        coroutineScope.launch {
            try {
                val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                    .requestIdToken("97092741015-hilqjqkk5h8jrfh955vr6lh5n4ecur35.apps.googleusercontent.com")
                    .requestEmail()
                    .build()
                val client = GoogleSignIn.getClient(context, gso)
                val account = client.silentSignIn().await()
                
                val token = account.idToken
                if (token != null) {
                    urlToLoad = "https://campus-nav-gitam.web.app/?googleIdToken=$token"
                } else {
                    // Fallback to public map if token is null
                    urlToLoad = "https://campus-nav-gitam.web.app/"
                }
            } catch (e: Exception) {
                // If silent sign in fails, just load the public map
                urlToLoad = "https://campus-nav-gitam.web.app/"
            }
        }
    }

    if (errorMsg != null) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Error loading map: $errorMsg")
        }
    } else if (urlToLoad == null) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
    } else {
        AndroidView(
            modifier = modifier.fillMaxSize(),
            factory = { ctx ->
                WebView(ctx).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.setGeolocationEnabled(true)
                    settings.cacheMode = WebSettings.LOAD_DEFAULT

                    webChromeClient = object : WebChromeClient() {
                        override fun onGeolocationPermissionsShowPrompt(
                            origin: String?,
                            callback: GeolocationPermissions.Callback?
                        ) {
                            if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                                callback?.invoke(origin, true, false)
                            } else {
                                // Request permissions via launcher if not granted yet
                                permissionLauncher.launch(arrayOf(
                                    Manifest.permission.ACCESS_FINE_LOCATION,
                                    Manifest.permission.ACCESS_COARSE_LOCATION
                                ))
                                // Deny for now, user will have to click the button again after granting
                                callback?.invoke(origin, false, false)
                            }
                        }
                    }
                    
                    webViewClient = WebViewClient()
                    loadUrl(urlToLoad!!)
                }
            },
            update = { webView ->
                // Only load if URL changes
                if (webView.url != urlToLoad && webView.url?.contains("googleIdToken") == false) {
                    webView.loadUrl(urlToLoad!!)
                }
            }
        )
    }
}
