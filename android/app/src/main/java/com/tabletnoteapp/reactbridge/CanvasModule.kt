package com.tabletnoteapp.reactbridge

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.UIManagerModule
import com.tabletnoteapp.canvas.DrawingCanvas

/**
 * Exposes imperative commands (undo, redo, clear, getStrokes, loadStrokes) to React Native JS.
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

    @ReactMethod
    fun getStrokes(viewTag: Int, promise: Promise) {
        reactContext.runOnUiQueueThread {
            val uiManager = reactContext.getNativeModule(UIManagerModule::class.java)
            val view = uiManager?.resolveView(viewTag) as? DrawingCanvas
            if (view != null) {
                promise.resolve(view.getStrokesJson())
            } else {
                promise.reject("ERR_NO_VIEW", "Canvas view not found for tag $viewTag")
            }
        }
    }

    @ReactMethod
    fun loadStrokes(viewTag: Int, json: String) {
        withCanvas(viewTag) { it.loadStrokesJson(json) }
    }

    private fun withCanvas(viewTag: Int, block: (DrawingCanvas) -> Unit) {
        reactContext.runOnUiQueueThread {
            val uiManager = reactContext.getNativeModule(UIManagerModule::class.java) ?: return@runOnUiQueueThread
            val view = uiManager.resolveView(viewTag) as? DrawingCanvas ?: return@runOnUiQueueThread
            block(view)
        }
    }
}
