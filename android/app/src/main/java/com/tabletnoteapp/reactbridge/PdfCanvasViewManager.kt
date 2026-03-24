package com.tabletnoteapp.reactbridge

import android.graphics.Color
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.tabletnoteapp.canvas.PdfDrawingView
import com.tabletnoteapp.canvas.models.ShapeType
import com.tabletnoteapp.canvas.models.TextElement
import com.tabletnoteapp.canvas.models.ToolType

class PdfCanvasViewManager : SimpleViewManager<PdfDrawingView>() {

    override fun getName() = "PdfCanvasView"

    override fun createViewInstance(context: ThemedReactContext): PdfDrawingView {
        val view = PdfDrawingView(context)

        view.onPageChanged = { page ->
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("pdfCanvasPageChanged", Arguments.createMap().apply { putInt("page", page) })
        }
        view.onLoadComplete = { totalPages ->
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("pdfCanvasLoadComplete", Arguments.createMap().apply { putInt("totalPages", totalPages) })
        }
        view.onUndoRedoStateChanged = { canUndo, canRedo ->
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("canvasUndoRedoState", Arguments.createMap().apply {
                    putBoolean("canUndo", canUndo)
                    putBoolean("canRedo", canRedo)
                })
        }
        view.onEraserLift = {
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("canvasEraserLift", null)
        }
        view.onSelectionChanged = { hasSelection, count, bounds ->
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("pdfSelectionChanged", Arguments.createMap().apply {
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

        view.onTextTap = { docX, docY, width, height ->
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("pdfCanvasTextTap", Arguments.createMap().apply {
                    putDouble("docX", docX.toDouble())
                    putDouble("docY", docY.toDouble())
                    putDouble("width", width.toDouble())
                    putDouble("height", height.toDouble())
                })
        }

        view.onTextEditTap = { el ->
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("pdfCanvasTextEditTap", Arguments.createMap().apply {
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
                })
        }

        return view
    }

    @ReactProp(name = "pdfUri")
    fun setPdfUri(view: PdfDrawingView, uri: String?) {
        if (uri != null) view.openPdf(uri)
    }

    @ReactProp(name = "tool")
    fun setTool(view: PdfDrawingView, tool: String?) {
        view.currentTool = when (tool) {
            "eraser"      -> ToolType.ERASER
            "pen"         -> ToolType.PEN
            "highlighter" -> ToolType.HIGHLIGHTER
            "select"      -> ToolType.SELECT
            "scroll"      -> ToolType.SCROLL
            "text"        -> ToolType.TEXT
            "laser"       -> ToolType.LASER
            "shapes"      -> ToolType.SHAPES
            else          -> ToolType.SCROLL
        }
    }

    @ReactProp(name = "shapeType")
    fun setShapeType(view: PdfDrawingView, type: String?) {
        view.currentShapeType = when (type) {
            "arrow"     -> ShapeType.ARROW
            "rectangle" -> ShapeType.RECTANGLE
            "oval"      -> ShapeType.OVAL
            else        -> ShapeType.LINE
        }
    }

    @ReactProp(name = "shapeColor")
    fun setShapeColor(view: PdfDrawingView, color: String?) {
        if (color != null) view.shapeColor = Color.parseColor(color)
    }

    @ReactProp(name = "shapeThickness", defaultFloat = 4f)
    fun setShapeThickness(view: PdfDrawingView, thickness: Float) {
        view.shapeThickness = thickness
    }

    @ReactProp(name = "penColor")
    fun setPenColor(view: PdfDrawingView, color: String?) {
        if (color != null) view.penColor = Color.parseColor(color)
    }

    @ReactProp(name = "laserColor")
    fun setLaserColor(view: PdfDrawingView, color: String?) {
        if (color != null) view.laserColor = Color.parseColor(color)
    }

    @ReactProp(name = "penThickness", defaultFloat = 4f)
    fun setPenThickness(view: PdfDrawingView, thickness: Float) {
        view.penThickness = thickness
    }

    @ReactProp(name = "eraserThickness", defaultFloat = 24f)
    fun setEraserThickness(view: PdfDrawingView, thickness: Float) {
        view.eraserThickness = thickness
    }

    @ReactProp(name = "eraserMode")
    fun setEraserMode(view: PdfDrawingView, mode: String?) {
        view.eraserMode = mode ?: "pixel"
    }

    @ReactProp(name = "highlighterColor")
    fun setHighlighterColor(view: PdfDrawingView, color: String?) {
        if (color != null) view.highlighterColor = Color.parseColor(color)
    }

    @ReactProp(name = "highlighterThickness", defaultFloat = 16f)
    fun setHighlighterThickness(view: PdfDrawingView, thickness: Float) {
        view.highlighterThickness = thickness
    }
}
