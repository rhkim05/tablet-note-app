package com.drafty.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.navigation.compose.rememberNavController
import com.drafty.android.ui.navigation.DraftyNavHost
import com.drafty.android.ui.theme.DraftyTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            DraftyTheme {
                val navController = rememberNavController()
                DraftyNavHost(navController = navController)
            }
        }
    }
}
