package com.tabletnoteapp.reactbridge

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * Registers CanvasViewManager and CanvasModule with the React Native runtime.
 * Must be added to MainApplication.kt's getPackages().
 */
class CanvasPackage : ReactPackage {

    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
        listOf(CanvasViewManager())

    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
        listOf(CanvasModule(context))
}
