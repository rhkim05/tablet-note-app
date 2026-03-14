package com.tabletnoteapp.reactbridge

import android.graphics.Color
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.tabletnoteapp.canvas.PdfDrawingView
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
            else          -> ToolType.SCROLL
        }
    }

    @ReactProp(name = "penColor")
    fun setPenColor(view: PdfDrawingView, color: String?) {
        if (color != null) view.penColor = Color.parseColor(color)
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
