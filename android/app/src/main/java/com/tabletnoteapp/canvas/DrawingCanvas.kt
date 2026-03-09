package com.tabletnoteapp.canvas

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.view.MotionEvent
import android.view.View
import com.tabletnoteapp.canvas.models.Point
import com.tabletnoteapp.canvas.models.Stroke
import com.tabletnoteapp.canvas.models.StrokeStyle
import com.tabletnoteapp.canvas.models.ToolType
import com.tabletnoteapp.canvas.utils.BezierSmoother
import org.json.JSONArray
import org.json.JSONObject

class DrawingCanvas(context: Context) : View(context) {

    init {
        // Required for PorterDuff.Mode.CLEAR (eraser) to work — hardware acceleration ignores it
        setLayerType(LAYER_TYPE_SOFTWARE, null)
    }

    // ── State ────────────────────────────────────────────────────────────────

    private val committedStrokes = mutableListOf<Stroke>()   // finished strokes
    private val redoStack        = mutableListOf<Stroke>()   // redo history
    private var activeStroke: Stroke? = null                 // stroke being drawn

    // ── Tool settings (can be changed from RN bridge) ─────────────────────

    var penColor: Int     = Color.BLACK
    var penThickness: Float = 4f
    var eraserThickness: Float = 24f
    var currentTool: ToolType = ToolType.PEN

    // ── Callbacks (RN bridge sets these) ─────────────────────────────────

    var onUndoRedoStateChanged: ((canUndo: Boolean, canRedo: Boolean) -> Unit)? = null

    // ── Rendering ────────────────────────────────────────────────────────────

    // Off-screen bitmap for committed strokes (avoids replaying all paths every frame)
    private var bitmap: Bitmap? = null
    private var bitmapCanvas: Canvas? = null

    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }

    private val eraserPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR)
    }

    // ── View lifecycle ───────────────────────────────────────────────────────

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        // Recreate off-screen bitmap at new size, preserving existing drawing
        val newBitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val newCanvas = Canvas(newBitmap)
        bitmap?.let { newCanvas.drawBitmap(it, 0f, 0f, null) }
        bitmap = newBitmap
        bitmapCanvas = newCanvas
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        // Draw committed strokes from off-screen bitmap
        bitmap?.let { canvas.drawBitmap(it, 0f, 0f, null) }

        // Draw the active (in-progress) stroke live
        activeStroke?.let { stroke ->
            val path = BezierSmoother.buildPath(stroke.points) ?: return@let
            canvas.drawPath(path, paintForStroke(stroke))
        }
    }

    // ── Touch handling ────────────────────────────────────────────────────────

    override fun onGenericMotionEvent(event: MotionEvent): Boolean {
        if (event.isFromSource(android.view.InputDevice.SOURCE_MOUSE)) {
            return onTouchEvent(event)
        }
        return super.onGenericMotionEvent(event)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val x = event.x
        val y = event.y
        val rawPressure = event.pressure.coerceIn(0f, 1f)
        // 마우스 입력은 pressure가 항상 1.0이므로 스타일러스와 동일하게 처리
        val pressure = if (event.getToolType(0) == MotionEvent.TOOL_TYPE_MOUSE) 1f else rawPressure

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                parent?.requestDisallowInterceptTouchEvent(true)
                redoStack.clear()
                val style = StrokeStyle(
                    color     = if (currentTool == ToolType.ERASER) Color.TRANSPARENT else penColor,
                    thickness = if (currentTool == ToolType.ERASER) eraserThickness else penThickness,
                    tool      = currentTool,
                )
                activeStroke = Stroke(style = style).also {
                    it.addPoint(Point(x, y, pressure))
                }
                notifyUndoRedoState()
                invalidate()
            }

            MotionEvent.ACTION_MOVE -> {
                activeStroke?.let { stroke ->
                    stroke.addPoint(Point(x, y, pressure))
                    invalidate()
                }
            }

            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                activeStroke?.let { stroke ->
                    stroke.addPoint(Point(x, y, pressure))
                    commitStroke(stroke)
                    activeStroke = null
                    notifyUndoRedoState()
                }
            }
        }
        return true
    }

    // ── Stroke commit ─────────────────────────────────────────────────────────

    private fun commitStroke(stroke: Stroke) {
        if (stroke.isEmpty) return
        committedStrokes.add(stroke)

        // Render into off-screen bitmap
        val path = BezierSmoother.buildPath(stroke.points) ?: return
        bitmapCanvas?.drawPath(path, paintForStroke(stroke))
        invalidate()
    }

    // ── Undo / Redo ───────────────────────────────────────────────────────────

    fun undo() {
        if (committedStrokes.isEmpty()) return
        val last = committedStrokes.removeLast()
        redoStack.add(last)
        redrawBitmap()
        notifyUndoRedoState()
    }

    fun redo() {
        if (redoStack.isEmpty()) return
        val stroke = redoStack.removeLast()
        committedStrokes.add(stroke)
        val path = BezierSmoother.buildPath(stroke.points) ?: return
        bitmapCanvas?.drawPath(path, paintForStroke(stroke))
        invalidate()
        notifyUndoRedoState()
    }

    fun canUndo() = committedStrokes.isNotEmpty()
    fun canRedo() = redoStack.isNotEmpty()

    // Replay all committed strokes onto a fresh bitmap
    private fun redrawBitmap() {
        val w = width; val h = height
        if (w == 0 || h == 0) return
        val newBitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val newCanvas = Canvas(newBitmap)
        for (stroke in committedStrokes) {
            val path = BezierSmoother.buildPath(stroke.points) ?: continue
            newCanvas.drawPath(path, paintForStroke(stroke))
        }
        bitmap = newBitmap
        bitmapCanvas = newCanvas
        invalidate()
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun paintForStroke(stroke: Stroke): Paint {
        return if (stroke.style.tool == ToolType.ERASER) {
            eraserPaint.also { it.strokeWidth = stroke.style.thickness }
        } else {
            strokePaint.also {
                it.color = stroke.style.color
                it.strokeWidth = stroke.style.thickness
            }
        }
    }

    private fun notifyUndoRedoState() {
        onUndoRedoStateChanged?.invoke(canUndo(), canRedo())
    }

    fun clearCanvas() {
        committedStrokes.clear()
        redoStack.clear()
        bitmap?.eraseColor(Color.TRANSPARENT)
        notifyUndoRedoState()
        invalidate()
    }

    // ── Serialization ─────────────────────────────────────────────────────────

    fun getStrokesJson(): String {
        val strokesArray = JSONArray()
        for (stroke in committedStrokes) {
            val strokeObj = JSONObject()
            strokeObj.put("tool", stroke.style.tool.name)
            strokeObj.put("color", stroke.style.color)
            strokeObj.put("thickness", stroke.style.thickness.toDouble())

            val pointsArray = JSONArray()
            for (point in stroke.points) {
                val pointObj = JSONObject()
                pointObj.put("x", point.x.toDouble())
                pointObj.put("y", point.y.toDouble())
                pointObj.put("pressure", point.pressure.toDouble())
                pointsArray.put(pointObj)
            }
            strokeObj.put("points", pointsArray)
            strokesArray.put(strokeObj)
        }
        return strokesArray.toString()
    }

    fun loadStrokesJson(json: String) {
        committedStrokes.clear()
        redoStack.clear()

        val strokesArray = JSONArray(json)
        for (i in 0 until strokesArray.length()) {
            val strokeObj = strokesArray.getJSONObject(i)
            val tool = ToolType.valueOf(strokeObj.getString("tool"))
            val style = StrokeStyle(
                color     = strokeObj.getInt("color"),
                thickness = strokeObj.getDouble("thickness").toFloat(),
                tool      = tool,
            )
            val stroke = Stroke(style = style)
            val pointsArray = strokeObj.getJSONArray("points")
            for (j in 0 until pointsArray.length()) {
                val pointObj = pointsArray.getJSONObject(j)
                stroke.addPoint(Point(
                    x        = pointObj.getDouble("x").toFloat(),
                    y        = pointObj.getDouble("y").toFloat(),
                    pressure = pointObj.getDouble("pressure").toFloat(),
                ))
            }
            committedStrokes.add(stroke)
        }

        redrawBitmap()
        notifyUndoRedoState()
    }
}
