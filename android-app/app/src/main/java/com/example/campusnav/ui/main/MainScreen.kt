package com.example.campusnav.ui.main

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.School
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.campusnav.ui.timetable.TimetableScreen
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.ktx.auth
import com.google.firebase.ktx.Firebase
import com.example.campusnav.ui.map.MapScreen

@Composable
fun MainScreen(modifier: Modifier = Modifier) {
    var user by remember { mutableStateOf(Firebase.auth.currentUser) }
    
    val context = LocalContext.current
    val activity = context as? Activity
    val targetTab = activity?.intent?.getStringExtra("target_tab")
    var selectedTab by remember { mutableIntStateOf(if (targetTab == "timetable") 1 else 0) }

    if (user != null) {
        Scaffold(
            bottomBar = {
                NavigationBar {
                    NavigationBarItem(
                        icon = { Icon(Icons.Filled.Map, contentDescription = "Map") },
                        label = { Text("Map") },
                        selected = selectedTab == 0,
                        onClick = { selectedTab = 0 }
                    )
                    NavigationBarItem(
                        icon = { Icon(Icons.Filled.School, contentDescription = "Timetable") },
                        label = { Text("Timetable") },
                        selected = selectedTab == 1,
                        onClick = { selectedTab = 1 }
                    )
                }
            }
        ) { innerPadding ->
            Box(modifier = Modifier.padding(innerPadding).fillMaxSize()) {
                if (selectedTab == 0) {
                    MapScreen()
                } else {
                    TimetableScreen(onSignOut = {
                        Firebase.auth.signOut()
                        user = null
                    })
                }
            }
        }
    } else {
        LoginContent(
            onLoginSuccess = { user = Firebase.auth.currentUser },
            modifier = modifier
        )
    }
}

@Composable
fun LoginContent(onLoginSuccess: () -> Unit, modifier: Modifier = Modifier) {
    var error by remember { mutableStateOf("") }
    val context = LocalContext.current

    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
            try {
                val account = task.getResult(ApiException::class.java)!!
                val credential = GoogleAuthProvider.getCredential(account.idToken, null)
                Firebase.auth.signInWithCredential(credential).addOnCompleteListener { authTask ->
                    if (authTask.isSuccessful) {
                        onLoginSuccess()
                    } else {
                        error = authTask.exception?.message ?: "Google Auth Failed"
                    }
                }
            } catch (e: ApiException) {
                error = "Google Sign In Failed: ${e.statusCode}"
            }
        }
    }

    Box(
        modifier = modifier.fillMaxSize().padding(16.dp),
        contentAlignment = Alignment.Center
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(0.9f),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(
                modifier = Modifier.padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(
                    imageVector = Icons.Filled.Map,
                    contentDescription = "App Logo",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(64.dp)
                )
                Spacer(modifier = Modifier.height(16.dp))
                
                Text(
                    text = "Campus Nav",
                    style = MaterialTheme.typography.headlineLarge.copy(
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                )
                Text(
                    text = "Welcome back",
                    style = MaterialTheme.typography.bodyLarge.copy(
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                )
                
                Spacer(modifier = Modifier.height(48.dp))
                
                if (error.isNotEmpty()) {
                    Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    Spacer(modifier = Modifier.height(16.dp))
                }

                Button(
                    onClick = {
                        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                            .requestIdToken("97092741015-hilqjqkk5h8jrfh955vr6lh5n4ecur35.apps.googleusercontent.com")
                            .requestEmail()
                            .build()
                        val client = GoogleSignIn.getClient(context, gso)
                        launcher.launch(client.signInIntent)
                    },
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                    shape = RoundedCornerShape(25.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer,
                        contentColor = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                ) {
                    Text("Sign in with Google", fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}
