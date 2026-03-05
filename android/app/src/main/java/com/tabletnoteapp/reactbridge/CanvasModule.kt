package com.tabletnoteapp.reactbridge

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.UIManagerModule
import com.tabletnoteapp.canvas.DrawingCanvas

/**
 * Exposes imperative commands (undo, redo, clear) to React Native JS.
 * Usage from JS: NativeModules.CanvasModule.undo(viewTag)
 */
class CanvasModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "CanvasModule"

    @ReactMethod
    fun undo(viewTag: Int) {
        withCanvas(viewTag) { it.undo() }
    }

    @ReactMethod
    fun redo(viewTag: Int) {
        withCanvas(viewTag) { it.redo() }
    }

    @ReactMethod
    fun clear(viewTag: Int) {
        withCanvas(viewTag) { it.clearCanvas() }
    }

    private fun withCanvas(viewTag: Int, block: (DrawingCanvas) -> Unit) {
        reactContext.runOnUiQueueThread {
            val uiManager = reactContext.getNativeModule(UIManagerModule::class.java) ?: return@runOnUiQueueThread
            val view = uiManager.resolveView(viewTag) as? DrawingCanvas ?: return@runOnUiQueueThread
            block(view)
        }
    }
}
