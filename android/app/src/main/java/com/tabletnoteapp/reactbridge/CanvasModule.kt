package com.tabletnoteapp.reactbridge

import android.graphics.Color
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

    @ReactMethod
    fun scrollToPage(viewTag: Int, page: Int) {
        withCanvas(viewTag) { it.scrollToPage(page - 1) }  // JS 1-indexed → Kotlin 0-indexed
    }

    @ReactMethod
    fun getScale(viewTag: Int, promise: Promise) {
        reactContext.runOnUiQueueThread {
            val view = reactContext.getNativeModule(UIManagerModule::class.java)?.resolveView(viewTag) as? DrawingCanvas
            if (view != null) promise.resolve(view.scale.toDouble())
            else promise.reject("ERR_NO_VIEW", "Canvas view not found for tag $viewTag")
        }
    }

    @ReactMethod
    fun setScale(viewTag: Int, scale: Double) {
        withCanvas(viewTag) { it.applyScale(scale.toFloat()) }
    }

    @ReactMethod
    fun deleteSelected(viewTag: Int) {
        withCanvas(viewTag) { it.deleteSelected() }
    }

    @ReactMethod
    fun captureSelected(viewTag: Int, promise: Promise) {
        reactContext.runOnUiQueueThread {
            val uiManager = reactContext.getNativeModule(UIManagerModule::class.java)
            val view = uiManager?.resolveView(viewTag) as? DrawingCanvas
            if (view != null) {
                val path = view.captureSelection()
                if (path.isNotEmpty()) promise.resolve(path)
                else promise.reject("ERR_CAPTURE", "Nothing selected to capture")
            } else {
                promise.reject("ERR_NO_VIEW", "Canvas view not found for tag $viewTag")
            }
        }
    }

    @ReactMethod
    fun cutSelected(viewTag: Int, promise: Promise) {
        reactContext.runOnUiQueueThread {
            val uiManager = reactContext.getNativeModule(UIManagerModule::class.java)
            val view = uiManager?.resolveView(viewTag) as? DrawingCanvas
            if (view != null) {
                val json = view.getSelectedStrokesJson()
                view.deleteSelected()
                promise.resolve(json)
            } else {
                promise.reject("ERR_NO_VIEW", "Canvas view not found for tag $viewTag")
            }
        }
    }

    @ReactMethod
    fun addTextElement(viewTag: Int, id: String, text: String, x: Double, y: Double, width: Double, height: Double, fontSize: Double, color: String, bold: Boolean, italic: Boolean, fontFamily: String) {
        withCanvas(viewTag) { it.addTextElement(id, text, x.toFloat(), y.toFloat(), width.toFloat(), height.toFloat(), fontSize.toFloat(), Color.parseColor(color), bold, italic, fontFamily) }
    }

    @ReactMethod
    fun updateTextElement(viewTag: Int, id: String, text: String, fontSize: Double, color: String, bold: Boolean, italic: Boolean, fontFamily: String) {
        withCanvas(viewTag) { it.updateTextElement(id, text, fontSize.toFloat(), Color.parseColor(color), bold, italic, fontFamily) }
    }

    @ReactMethod
    fun deleteTextElement(viewTag: Int, id: String) {
        withCanvas(viewTag) { it.deleteTextElement(id) }
    }

    @ReactMethod
    fun setActiveText(viewTag: Int, id: String) {
        withCanvas(viewTag) { it.setActiveText(id) }
    }

    @ReactMethod
    fun clearPendingBox(viewTag: Int) {
        withCanvas(viewTag) { it.clearPendingBox() }
    }

    private fun withCanvas(viewTag: Int, block: (DrawingCanvas) -> Unit) {
        reactContext.runOnUiQueueThread {
            val uiManager = reactContext.getNativeModule(UIManagerModule::class.java) ?: return@runOnUiQueueThread
            val view = uiManager.resolveView(viewTag) as? DrawingCanvas ?: return@runOnUiQueueThread
            block(view)
        }
    }
}
