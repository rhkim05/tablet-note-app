package com.drafty.android.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.drafty.android.ui.canvas.CanvasScreen
import com.drafty.android.ui.library.LibraryScreen
import com.drafty.android.ui.notebook.NotebookScreen

object Routes {
    const val LIBRARY = "library"
    const val NOTEBOOK = "notebook/{notebookId}"
    const val CANVAS = "canvas/{notebookId}/{pageId}"

    fun notebook(notebookId: String) = "notebook/$notebookId"
    fun canvas(notebookId: String, pageId: String) = "canvas/$notebookId/$pageId"
}

@Composable
fun DraftyNavHost(navController: NavHostController) {
    NavHost(
        navController = navController,
        startDestination = Routes.LIBRARY
    ) {
        composable(Routes.LIBRARY) {
            LibraryScreen(
                onNotebookClick = { notebookId ->
                    navController.navigate(Routes.notebook(notebookId))
                }
            )
        }

        composable(
            route = Routes.NOTEBOOK,
            arguments = listOf(navArgument("notebookId") { type = NavType.StringType })
        ) { backStackEntry ->
            val notebookId = backStackEntry.arguments?.getString("notebookId") ?: return@composable
            NotebookScreen(
                notebookId = notebookId,
                onPageClick = { pageId ->
                    navController.navigate(Routes.canvas(notebookId, pageId))
                },
                onBack = { navController.popBackStack() }
            )
        }

        composable(
            route = Routes.CANVAS,
            arguments = listOf(
                navArgument("notebookId") { type = NavType.StringType },
                navArgument("pageId") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val notebookId = backStackEntry.arguments?.getString("notebookId") ?: return@composable
            val pageId = backStackEntry.arguments?.getString("pageId") ?: return@composable
            CanvasScreen(
                notebookId = notebookId,
                pageId = pageId,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
