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
import com.tabletnoteapp.canvas.models.UndoAction
import com.tabletnoteapp.canvas.utils.BezierSmoother
import org.json.JSONArray
import org.json.JSONObject

class DrawingCanvas(context: Context) : View(context) {

    init {
        // Required for PorterDuff.Mode.CLEAR (eraser) to work — hardware acceleration ignores it
        setLayerType(LAYER_TYPE_SOFTWARE, null)
    }

    // ── State ────────────────────────────────────────────────────────────────

    private val committedStrokes    = mutableListOf<Stroke>()
    private val undoStack           = mutableListOf<UndoAction>()
    private val redoStack           = mutableListOf<UndoAction>()
    private var activeStroke: Stroke? = null
    private val strokeEraserBuffer  = mutableListOf<Pair<Int, Stroke>>() // (originalIndex, stroke)
    private var strokeOriginalIndexMap: Map<Stroke, Int> = emptyMap()

    // ── Tool settings (can be changed from RN bridge) ─────────────────────

    var penColor: Int          = Color.BLACK
    var penThickness: Float    = 4f
    var eraserThickness: Float = 24f
    var currentTool: ToolType  = ToolType.PEN
    var eraserMode: String     = "pixel"   // "pixel" | "stroke"

    // ── Callbacks ─────────────────────────────────────────────────────────

    var onUndoRedoStateChanged: ((canUndo: Boolean, canRedo: Boolean) -> Unit)? = null
    var onEraserLift: (() -> Unit)? = null

    // ── Rendering ────────────────────────────────────────────────────────────

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

    private val strokeEraserFillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = Color.argb(55, 150, 150, 150)
    }
    private val strokeEraserBorderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2f
        color = Color.argb(170, 90, 90, 90)
    }

    private var eraserCursorX = 0f
    private var eraserCursorY = 0f
    private var showEraserCursor = false

    // ── View lifecycle ───────────────────────────────────────────────────────

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        val newBitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val newCanvas = Canvas(newBitmap)
        bitmap?.let { newCanvas.drawBitmap(it, 0f, 0f, null) }
        bitmap = newBitmap
        bitmapCanvas = newCanvas
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        // Use saveLayer when the active stroke is a pixel eraser so PorterDuff.CLEAR only
        // clears within the layer — transparent holes then reveal the white view background
        // (from super.onDraw) rather than punching through to the dark parent in dark mode.
        val isEraserActive = activeStroke?.style?.tool == ToolType.ERASER
        val layerSave = if (isEraserActive) canvas.saveLayer(null, null) else -1

        bitmap?.let { canvas.drawBitmap(it, 0f, 0f, null) }
        activeStroke?.let { stroke ->
            val path = BezierSmoother.buildPath(stroke.points) ?: return@let
            canvas.drawPath(path, paintForStroke(stroke))
        }

        if (layerSave != -1) canvas.restoreToCount(layerSave)

        if (showEraserCursor) {
            val r = if (eraserMode == "stroke") eraserThickness else eraserThickness / 2f
            canvas.drawCircle(eraserCursorX, eraserCursorY, r, strokeEraserFillPaint)
            canvas.drawCircle(eraserCursorX, eraserCursorY, r, strokeEraserBorderPaint)
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
        val pressure = if (event.getToolType(0) == MotionEvent.TOOL_TYPE_MOUSE) 1f else rawPressure

        // Stroke-eraser mode: no active stroke drawn; instead remove whole strokes on touch
        if (currentTool == ToolType.ERASER && eraserMode == "stroke") {
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    parent?.requestDisallowInterceptTouchEvent(true)
                    redoStack.clear()
                    strokeEraserBuffer.clear()
                    strokeOriginalIndexMap = committedStrokes.mapIndexed { i, s -> s to i }.toMap()
                    eraserCursorX = x; eraserCursorY = y; showEraserCursor = true
                    eraseStrokesAtPoint(x, y)
                    notifyUndoRedoState()
                    invalidate()
                }
                MotionEvent.ACTION_MOVE -> {
                    eraserCursorX = x; eraserCursorY = y
                    eraseStrokesAtPoint(x, y)
                    invalidate()
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    showEraserCursor = false
                    if (strokeEraserBuffer.isNotEmpty()) {
                        undoStack.add(UndoAction.EraseStrokes(strokeEraserBuffer.toList()))
                        strokeEraserBuffer.clear()
                        strokeOriginalIndexMap = emptyMap()
                    }
                    notifyUndoRedoState()
                    onEraserLift?.invoke()
                    invalidate()
                }
            }
            return true
        }

        // Pixel-eraser / pen mode
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                parent?.requestDisallowInterceptTouchEvent(true)
                redoStack.clear()
                if (currentTool == ToolType.ERASER) {
                    eraserCursorX = x; eraserCursorY = y; showEraserCursor = true
                }
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
                if (currentTool == ToolType.ERASER) {
                    eraserCursorX = x; eraserCursorY = y
                }
                activeStroke?.let { stroke ->
                    stroke.addPoint(Point(x, y, pressure))
                    invalidate()
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                showEraserCursor = false
                activeStroke?.let { stroke ->
                    stroke.addPoint(Point(x, y, pressure))
                    commitStroke(stroke)
                    activeStroke = null
                    notifyUndoRedoState()
                    if (currentTool == ToolType.ERASER) onEraserLift?.invoke()
                }
            }
        }
        return true
    }

    // ── Stroke-eraser hit test ────────────────────────────────────────────────

    private fun eraseStrokesAtPoint(x: Float, y: Float) {
        val thresholdSq = eraserThickness * eraserThickness
        val toRemove = committedStrokes.filter { it.style.tool != ToolType.ERASER && strokeHitsPoint(it, x, y, thresholdSq) }
        if (toRemove.isNotEmpty()) {
            committedStrokes.removeAll(toRemove.toSet())
            toRemove.forEach { stroke ->
                val origIdx = strokeOriginalIndexMap[stroke] ?: 0
                strokeEraserBuffer.add(origIdx to stroke)
            }
            redrawBitmap()
        }
    }

    // Check if any segment of the stroke passes within sqrt(thresholdSq) of (x, y)
    private fun strokeHitsPoint(stroke: Stroke, x: Float, y: Float, thresholdSq: Float): Boolean {
        val pts = stroke.points
        if (pts.isEmpty()) return false
        if (pts.size == 1) {
            val dx = pts[0].x - x; val dy = pts[0].y - y
            return dx * dx + dy * dy <= thresholdSq
        }
        for (i in 0 until pts.size - 1) {
            if (segmentDistSq(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= thresholdSq) return true
        }
        return false
    }

    private fun segmentDistSq(px: Float, py: Float, ax: Float, ay: Float, bx: Float, by: Float): Float {
        val dx = bx - ax; val dy = by - ay
        val lenSq = dx * dx + dy * dy
        if (lenSq == 0f) { val ex = px - ax; val ey = py - ay; return ex * ex + ey * ey }
        val t = ((px - ax) * dx + (py - ay) * dy).div(lenSq).coerceIn(0f, 1f)
        val cx = ax + t * dx; val cy = ay + t * dy
        val ex = px - cx; val ey = py - cy
        return ex * ex + ey * ey
    }

    // ── Stroke commit ─────────────────────────────────────────────────────────

    private fun commitStroke(stroke: Stroke) {
        if (stroke.isEmpty) return
        committedStrokes.add(stroke)
        undoStack.add(UndoAction.AddStroke(stroke))
        val path = BezierSmoother.buildPath(stroke.points) ?: return
        bitmapCanvas?.drawPath(path, paintForStroke(stroke))
        invalidate()
    }

    // ── Undo / Redo ───────────────────────────────────────────────────────────

    fun undo() {
        val action = undoStack.removeLastOrNull() ?: return
        when (action) {
            is UndoAction.AddStroke -> committedStrokes.remove(action.stroke)
            is UndoAction.EraseStrokes -> {
                // Re-insert strokes at their original positions.
                // Insert in descending index order so earlier insertions don't shift later ones.
                for ((idx, stroke) in action.entries.sortedByDescending { it.first }) {
                    committedStrokes.add(idx.coerceIn(0, committedStrokes.size), stroke)
                }
            }
        }
        redrawBitmap()
        redoStack.add(action)
        notifyUndoRedoState()
    }

    fun redo() {
        val action = redoStack.removeLastOrNull() ?: return
        when (action) {
            is UndoAction.AddStroke -> {
                committedStrokes.add(action.stroke)
                val path = BezierSmoother.buildPath(action.stroke.points)
                if (path != null) bitmapCanvas?.drawPath(path, paintForStroke(action.stroke))
                else redrawBitmap()
                invalidate()
            }
            is UndoAction.EraseStrokes -> {
                committedStrokes.removeAll(action.entries.map { it.second }.toSet())
                redrawBitmap()
            }
        }
        undoStack.add(action)
        notifyUndoRedoState()
    }

    fun canUndo() = undoStack.isNotEmpty()
    fun canRedo() = redoStack.isNotEmpty()

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
        undoStack.clear()
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
        undoStack.clear()
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
