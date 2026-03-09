package com.tabletnoteapp.reactbridge

import android.graphics.Color
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.tabletnoteapp.canvas.DrawingCanvas
import com.tabletnoteapp.canvas.models.ToolType

/**
 * Exposes DrawingCanvas to React Native as a native view component named "CanvasView".
 * Props set from JS: tool, penColor, penThickness, eraserThickness
 */
class CanvasViewManager : SimpleViewManager<DrawingCanvas>() {

    override fun getName() = "CanvasView"

    override fun createViewInstance(context: ThemedReactContext): DrawingCanvas {
        val canvas = DrawingCanvas(context)
        canvas.onUndoRedoStateChanged = { canUndo, canRedo ->
            // Emit event to JS so the toolbar can update
            val reactContext = context
            val surfaceId = -1 // legacy bridge — surfaceId unused
            reactContext.getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("canvasUndoRedoState", com.facebook.react.bridge.Arguments.createMap().apply {
                    putBoolean("canUndo", canUndo)
                    putBoolean("canRedo", canRedo)
                })
        }
        return canvas
    }

    @ReactProp(name = "tool")
    fun setTool(view: DrawingCanvas, tool: String?) {
        view.currentTool = when (tool) {
            "eraser" -> ToolType.ERASER
            "select" -> ToolType.SELECT
            else     -> ToolType.PEN
        }
    }

    @ReactProp(name = "penColor")
    fun setPenColor(view: DrawingCanvas, color: String?) {
        if (color != null) {
            view.penColor = Color.parseColor(color)
        }
    }

    @ReactProp(name = "penThickness", defaultFloat = 4f)
    fun setPenThickness(view: DrawingCanvas, thickness: Float) {
        view.penThickness = thickness
    }

    @ReactProp(name = "eraserThickness", defaultFloat = 24f)
    fun setEraserThickness(view: DrawingCanvas, thickness: Float) {
        view.eraserThickness = thickness
    }
}
