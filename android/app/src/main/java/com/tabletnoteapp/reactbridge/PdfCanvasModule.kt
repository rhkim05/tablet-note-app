package com.tabletnoteapp.reactbridge

import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.UIManagerModule
import com.tabletnoteapp.canvas.PdfDrawingView
import java.io.File

class PdfCanvasModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "PdfCanvasModule"

    @ReactMethod fun undo(viewTag: Int)                { withView(viewTag) { it.undo() } }
    @ReactMethod fun redo(viewTag: Int)                { withView(viewTag) { it.redo() } }
    @ReactMethod fun clear(viewTag: Int)               { withView(viewTag) { it.clearCanvas() } }
    @ReactMethod fun deleteSelected(viewTag: Int)      { withView(viewTag) { it.deleteSelected() } }

    @ReactMethod
    fun getStrokes(viewTag: Int, promise: Promise) {
        reactContext.runOnUiQueueThread {
            val view = resolveView(viewTag)
            if (view != null) promise.resolve(view.getStrokesJson())
            else promise.reject("ERR_NO_VIEW", "PdfCanvasView not found for tag $viewTag")
        }
    }

    @ReactMethod
    fun loadStrokes(viewTag: Int, json: String) {
        withView(viewTag) { it.loadStrokesJson(json) }
    }

    @ReactMethod
    fun scrollToPage(viewTag: Int, page: Int) {
        withView(viewTag) { it.scrollToPage(page) }
    }

    @ReactMethod
    fun getScale(viewTag: Int, promise: Promise) {
        reactContext.runOnUiQueueThread {
            val view = resolveView(viewTag)
            if (view != null) promise.resolve(view.scale.toDouble())
            else promise.reject("ERR_NO_VIEW", "PdfCanvasView not found for tag $viewTag")
        }
    }

    @ReactMethod
    fun setScale(viewTag: Int, scale: Double) {
        withView(viewTag) { it.applyScale(scale.toFloat()) }
    }

    @ReactMethod
    fun getPageCount(filePath: String, promise: Promise) {
        try {
            val fd = ParcelFileDescriptor.open(File(filePath), ParcelFileDescriptor.MODE_READ_ONLY)
            val renderer = PdfRenderer(fd)
            val count = renderer.pageCount
            renderer.close()
            fd.close()
            promise.resolve(count)
        } catch (e: Exception) {
            promise.reject("ERR_PDF_PAGE_COUNT", e.message)
        }
    }

    @ReactMethod
    fun addTextElement(viewTag: Int, id: String, text: String, x: Double, y: Double, width: Double, height: Double, fontSize: Double, color: String, bold: Boolean, italic: Boolean, fontFamily: String) {
        withView(viewTag) { it.addTextElement(id, text, x.toFloat(), y.toFloat(), width.toFloat(), height.toFloat(), fontSize.toFloat(), Color.parseColor(color), bold, italic, fontFamily) }
    }

    @ReactMethod
    fun updateTextElement(viewTag: Int, id: String, text: String, fontSize: Double, color: String, bold: Boolean, italic: Boolean, fontFamily: String) {
        withView(viewTag) { it.updateTextElement(id, text, fontSize.toFloat(), Color.parseColor(color), bold, italic, fontFamily) }
    }

    @ReactMethod
    fun deleteTextElement(viewTag: Int, id: String) {
        withView(viewTag) { it.deleteTextElement(id) }
    }

    @ReactMethod
    fun setActiveText(viewTag: Int, id: String) {
        withView(viewTag) { it.setActiveText(id) }
    }

    @ReactMethod
    fun clearPendingBox(viewTag: Int) {
        withView(viewTag) { it.clearPendingBox() }
    }

    private fun withView(viewTag: Int, block: (PdfDrawingView) -> Unit) {
        reactContext.runOnUiQueueThread {
            resolveView(viewTag)?.let(block)
        }
    }

    private fun resolveView(viewTag: Int): PdfDrawingView? =
        reactContext.getNativeModule(UIManagerModule::class.java)
            ?.resolveView(viewTag) as? PdfDrawingView
}
