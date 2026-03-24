package com.tabletnoteapp.reactbridge

import android.graphics.Color
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.tabletnoteapp.canvas.DrawingCanvas
import com.tabletnoteapp.canvas.models.ShapeType
import com.tabletnoteapp.canvas.models.TextElement
import com.tabletnoteapp.canvas.models.ToolType

/**
 * Exposes DrawingCanvas to React Native as a native view component named "CanvasView".
 * Props set from JS: tool, penColor, penThickness, eraserThickness, eraserMode,
 *                    highlighterColor, highlighterThickness
 */
class CanvasViewManager : SimpleViewManager<DrawingCanvas>() {

    override fun getName() = "CanvasView"

    override fun createViewInstance(context: ThemedReactContext): DrawingCanvas {
        val canvas = DrawingCanvas(context)

        canvas.onUndoRedoStateChanged = { canUndo, canRedo ->
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("canvasUndoRedoState", Arguments.createMap().apply {
                    putBoolean("canUndo", canUndo)
                    putBoolean("canRedo", canRedo)
                })
        }

        canvas.onEraserLift = {
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("canvasEraserLift", null)
        }

        canvas.onSelectionChanged = { hasSelection, count, bounds ->
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("canvasSelectionChanged", Arguments.createMap().apply {
                    putBoolean("hasSelection", hasSelection)
                    putInt("count", count)
                    putMap("bounds", Arguments.createMap().apply {
                        putDouble("x", bounds.left.toDouble())
                        putDouble("y", bounds.top.toDouble())
                        putDouble("width", bounds.width().toDouble())
                        putDouble("height", bounds.height().toDouble())
                    })
                })
        }

        canvas.onPageChanged = { page ->
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("canvasPageChanged", Arguments.createMap().apply { putInt("page", page) })
        }

        canvas.onPageCountChanged = { total ->
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("canvasPageCountChanged", Arguments.createMap().apply { putInt("total", total) })
        }

        canvas.onTextTap = { docX, docY, width, height, screenX, screenY, screenW, screenH ->
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("canvasTextTap", Arguments.createMap().apply {
                    putDouble("docX", docX.toDouble())
                    putDouble("docY", docY.toDouble())
                    putDouble("width", width.toDouble())
                    putDouble("height", height.toDouble())
                    putDouble("screenX", screenX.toDouble())
                    putDouble("screenY", screenY.toDouble())
                    putDouble("screenW", screenW.toDouble())
                    putDouble("screenH", screenH.toDouble())
                })
        }

        canvas.onTextEditTap = { el, screenX, screenY, screenW, screenH ->
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("canvasTextEditTap", Arguments.createMap().apply {
                    putString("id", el.id)
                    putString("text", el.text)
                    putDouble("docX", el.x.toDouble())
                    putDouble("docY", el.y.toDouble())
                    putDouble("width", el.width.toDouble())
                    putDouble("height", el.height.toDouble())
                    putDouble("fontSize", el.fontSize.toDouble())
                    putInt("color", el.color)
                    putBoolean("bold", el.bold)
                    putBoolean("italic", el.italic)
                    putString("fontFamily", el.fontFamily)
                    putDouble("screenX", screenX.toDouble())
                    putDouble("screenY", screenY.toDouble())
                    putDouble("screenW", screenW.toDouble())
                    putDouble("screenH", screenH.toDouble())
                })
        }

        return canvas
    }

    @ReactProp(name = "tool")
    fun setTool(view: DrawingCanvas, tool: String?) {
        view.currentTool = when (tool) {
            "eraser"      -> ToolType.ERASER
            "select"      -> ToolType.SELECT
            "highlighter" -> ToolType.HIGHLIGHTER
            "scroll"      -> ToolType.SCROLL
            "text"        -> ToolType.TEXT
            "laser"       -> ToolType.LASER
            "shapes"      -> ToolType.SHAPES
            else          -> ToolType.PEN
        }
    }

    @ReactProp(name = "shapeType")
    fun setShapeType(view: DrawingCanvas, type: String?) {
        view.currentShapeType = when (type) {
            "arrow"     -> ShapeType.ARROW
            "rectangle" -> ShapeType.RECTANGLE
            "oval"      -> ShapeType.OVAL
            else        -> ShapeType.LINE
        }
    }

    @ReactProp(name = "shapeColor")
    fun setShapeColor(view: DrawingCanvas, color: String?) {
        if (color != null) view.shapeColor = Color.parseColor(color)
    }

    @ReactProp(name = "shapeThickness", defaultFloat = 4f)
    fun setShapeThickness(view: DrawingCanvas, thickness: Float) {
        view.shapeThickness = thickness
    }

    @ReactProp(name = "penColor")
    fun setPenColor(view: DrawingCanvas, color: String?) {
        if (color != null) view.penColor = Color.parseColor(color)
    }

    @ReactProp(name = "laserColor")
    fun setLaserColor(view: DrawingCanvas, color: String?) {
        if (color != null) view.laserColor = Color.parseColor(color)
    }

    @ReactProp(name = "penThickness", defaultFloat = 4f)
    fun setPenThickness(view: DrawingCanvas, thickness: Float) {
        view.penThickness = thickness
    }

    @ReactProp(name = "eraserThickness", defaultFloat = 24f)
    fun setEraserThickness(view: DrawingCanvas, thickness: Float) {
        view.eraserThickness = thickness
    }

    @ReactProp(name = "eraserMode")
    fun setEraserMode(view: DrawingCanvas, mode: String?) {
        view.eraserMode = mode ?: "pixel"
    }

    @ReactProp(name = "highlighterColor")
    fun setHighlighterColor(view: DrawingCanvas, color: String?) {
        if (color != null) view.highlighterColor = Color.parseColor(color)
    }

    @ReactProp(name = "highlighterThickness", defaultFloat = 16f)
    fun setHighlighterThickness(view: DrawingCanvas, thickness: Float) {
        view.highlighterThickness = thickness
    }
}
