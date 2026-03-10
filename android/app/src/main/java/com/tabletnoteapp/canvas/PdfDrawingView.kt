package com.tabletnoteapp.canvas

import android.content.Context
import android.graphics.*
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.widget.OverScroller
import com.tabletnoteapp.canvas.models.Point
import com.tabletnoteapp.canvas.models.Stroke
import com.tabletnoteapp.canvas.models.StrokeStyle
import com.tabletnoteapp.canvas.models.ToolType
import com.tabletnoteapp.canvas.models.UndoAction
import com.tabletnoteapp.canvas.utils.BezierSmoother
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

/**
 * Unified native View: PDF rendering + scroll + pinch zoom + stroke annotation.
 * All in one coordinate space — zero bridge involvement during interaction.
 *
 * Coordinate system (logical = scale 1.0 document coordinates):
 *   screen_x = logical_x * scale + translateX
 *   screen_y = logical_y * scale - scrollY        (scrollY in screen pixels)
 *
 * Strokes are stored in logical document coordinates.
 * scrollY and translateX are in screen pixels.
 */
class PdfDrawingView(context: Context) : View(context) {

    // ── PDF ───────────────────────────────────────────────────────────────────

    private val pdfLock = Any()
    private var pdfRenderer: PdfRenderer? = null
    private var fileDescriptor: ParcelFileDescriptor? = null
    private val renderExecutor = Executors.newSingleThreadExecutor()

    private val pageHeights   = mutableListOf<Int>()    // logical px height of each page (at current width)
    private val pageYOffsets  = mutableListOf<Float>()  // logical Y start of each page
    private val pageAspects   = mutableListOf<Float>()  // height/width ratio per page (stable across rotations)
    private var totalDocHeight = 0f                      // logical px, sum of pages + gaps

    private val pageCache      = HashMap<Int, Bitmap>()
    private val renderingPages = HashSet<Int>()
    private val maxCachedPages = 6

    // Render bitmaps at the device's largest dimension so they stay valid across rotations
    private val renderWidth: Int by lazy {
        val dm = resources.displayMetrics
        maxOf(dm.widthPixels, dm.heightPixels)
    }

    private var pendingPdfPath: String? = null
    private val pageGapPx get() = (20 * resources.displayMetrics.density).toInt()

    // ── Transform (screen pixels) ─────────────────────────────────────────────

    var scale      = 1f    // zoom factor [minScale, 4]
    var scrollY    = 0f    // vertical scroll in screen px; screen_y = logical_y * scale - scrollY
    var translateX = 0f    // horizontal pan in screen px; screen_x = logical_x * scale + translateX

    private val minScale = 0.85f

    private fun maxScrollY()    = (totalDocHeight * scale - height).coerceAtLeast(0f)
    private fun centeredTranslateX() = width * (1f - scale) / 2f   // centers page when zoomed out

    private fun constrain() {
        scale   = scale.coerceIn(minScale, 4f)
        scrollY = scrollY.coerceIn(0f, maxScrollY())
        translateX = if (scale <= 1f) {
            centeredTranslateX()   // page narrower than screen → keep centered, no panning
        } else {
            val minTx = -(width * (scale - 1f))
            translateX.coerceIn(minTx, 0f)
        }
    }

    // Logical coords from screen touch
    private fun toLogicalX(sx: Float) = (sx - translateX) / scale
    private fun toLogicalY(sy: Float) = (sy + scrollY) / scale

    // ── Pinch zoom ────────────────────────────────────────────────────────────

    private val scaleDetector = ScaleGestureDetector(context,
        object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(d: ScaleGestureDetector): Boolean {
                val newScale = (scale * d.scaleFactor).coerceIn(minScale, 4f)
                val f = newScale / scale          // actual factor applied
                if (f == 1f) return true

                // Adjust so the focal point stays fixed on screen
                translateX = (d.focusX * (1 - f) + translateX * f)
                scrollY    = (d.focusY * (f - 1) + scrollY * f)
                scale      = newScale
                constrain()
                notifyPageChanged()
                invalidate()
                return true
            }
        })

    // ── Scroll / fling ────────────────────────────────────────────────────────

    private val scroller       = OverScroller(context)
    private var velocityTracker: VelocityTracker? = null
    private var lastTouchX     = 0f
    private var lastTouchY     = 0f
    private var isDragging     = false
    private val touchSlop      = ViewConfiguration.get(context).scaledTouchSlop.toFloat()

    // ── Scrollbar drag ────────────────────────────────────────────────────────
    private var isScrollbarDragging = false
    private var scrollbarThumbOffset = 0f                         // y offset within thumb at drag start
    private val scrollbarTouchZoneW get() = 32f * resources.displayMetrics.density  // wider hit area

    // ── Drawing ───────────────────────────────────────────────────────────────

    private val committedStrokes   = mutableListOf<Stroke>()
    private val undoStack          = mutableListOf<UndoAction>()
    private val redoStack          = mutableListOf<UndoAction>()
    private var activeStroke: Stroke? = null
    private val strokeEraserBuffer = mutableListOf<Pair<Int, Stroke>>()
    private var strokeOriginalIndexMap: Map<Stroke, Int> = emptyMap()

    var currentTool:      ToolType = ToolType.SELECT
    var penColor:         Int      = Color.BLACK
    var penThickness:     Float    = 4f
    var eraserThickness:  Float    = 24f
    var eraserMode:       String   = "pixel"   // "pixel" | "stroke"

    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
    }
    private val eraserPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
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
    private val pageBgPaint = Paint().apply { color = Color.WHITE }
    private val scrollbarActivePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(220, 120, 120, 120)
    }
    private val scrollbarPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(160, 200, 200, 200)
    }

    // ── Callbacks ─────────────────────────────────────────────────────────────

    var onPageChanged:         ((Int) -> Unit)?             = null
    var onLoadComplete:        ((Int) -> Unit)?             = null
    var onUndoRedoStateChanged: ((Boolean, Boolean) -> Unit)? = null
    private var lastReportedPage = -1

    init { setLayerType(LAYER_TYPE_SOFTWARE, null) }

    // ── PDF management ────────────────────────────────────────────────────────

    fun openPdf(filePath: String) {
        if (width == 0 || height == 0) { pendingPdfPath = filePath; return }
        pendingPdfPath = null
        pageCache.values.forEach { it.recycle() }
        pageCache.clear(); renderingPages.clear()
        pageHeights.clear(); pageYOffsets.clear(); pageAspects.clear()
        scrollY = 0f; translateX = 0f; scale = 1f; totalDocHeight = 0f
        invalidate()

        renderExecutor.submit {
            synchronized(pdfLock) { pdfRenderer?.close(); fileDescriptor?.close()
                pdfRenderer = null; fileDescriptor = null }
            try {
                val fd = ParcelFileDescriptor.open(File(filePath), ParcelFileDescriptor.MODE_READ_ONLY)
                val renderer = PdfRenderer(fd)
                synchronized(pdfLock) { fileDescriptor = fd; pdfRenderer = renderer }

                val vw = width
                val gap = pageGapPx
                val heights = mutableListOf<Int>()
                val offsets = mutableListOf<Float>()
                val aspects = mutableListOf<Float>()
                var y = 0f
                for (i in 0 until renderer.pageCount) {
                    synchronized(pdfLock) {
                        val page = renderer.openPage(i)
                        val aspect = page.height.toFloat() / page.width.toFloat()
                        val h = (vw * aspect).toInt()
                        page.close()
                        aspects.add(aspect); heights.add(h); offsets.add(y); y += h + gap
                    }
                }
                post {
                    pageAspects.clear(); pageAspects.addAll(aspects)
                    pageHeights.clear(); pageHeights.addAll(heights)
                    pageYOffsets.clear(); pageYOffsets.addAll(offsets)
                    totalDocHeight = y
                    onLoadComplete?.invoke(renderer.pageCount)
                    invalidate()
                }
            } catch (_: Exception) {}
        }
    }

    private fun renderPageAsync(index: Int) {
        val aspect = pageAspects.getOrNull(index) ?: return
        if (renderingPages.contains(index)) return
        renderingPages.add(index)
        val rw = renderWidth
        val rh = (rw * aspect).toInt()
        renderExecutor.submit {
            try {
                val bm = Bitmap.createBitmap(rw, rh, Bitmap.Config.ARGB_8888)
                bm.eraseColor(Color.WHITE)
                synchronized(pdfLock) {
                    val r = pdfRenderer ?: return@submit
                    val p = r.openPage(index)
                    p.render(bm, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    p.close()
                }
                post {
                    pageCache[index] = bm; renderingPages.remove(index)
                    evictDistantPages(); invalidate()
                }
            } catch (_: Exception) { renderingPages.remove(index) }
        }
    }

    private fun evictDistantPages() {
        if (pageCache.size <= maxCachedPages) return
        val cur = getCurrentPage()
        pageCache.keys.sortedBy { Math.abs(it - cur) }.drop(maxCachedPages)
            .forEach { pageCache.remove(it)?.recycle() }
    }

    // ── View lifecycle ────────────────────────────────────────────────────────

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (pendingPdfPath != null) {
            openPdf(pendingPdfPath!!)
        } else if (w != oldw && w > 0) {
            reLayoutPages(w)
        }
    }

    private fun reLayoutPages(vw: Int) {
        if (pageAspects.isEmpty()) return
        // Pure arithmetic — bitmaps are reused as-is (rendered at renderWidth, scaled in onDraw)
        val gap = pageGapPx
        pageHeights.clear(); pageYOffsets.clear()
        var y = 0f
        for (aspect in pageAspects) {
            val h = (vw * aspect).toInt()
            pageHeights.add(h); pageYOffsets.add(y); y += h + gap
        }
        totalDocHeight = y
        scrollY = scrollY.coerceIn(0f, maxScrollY())
        constrain()
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        // Logical visibility window
        val logVisTop    = scrollY / scale
        val logVisBottom = (scrollY + height) / scale

        // Apply transform: logical → screen
        canvas.save()
        canvas.translate(translateX, -scrollY)
        canvas.scale(scale, scale)

        // 1. PDF pages
        for (i in pageYOffsets.indices) {
            val top = pageYOffsets[i]
            val ph  = pageHeights.getOrNull(i) ?: continue
            if (top + ph < logVisTop || top > logVisBottom) continue
            val bm = pageCache[i]
            val dst = RectF(0f, top, width.toFloat(), top + ph)
            if (bm != null) canvas.drawBitmap(bm, null, dst, null)
            else { canvas.drawRect(dst, pageBgPaint); renderPageAsync(i) }
        }

        // 2. Annotation strokes
        // Use saveLayer when erasers are present so PorterDuff.CLEAR only affects the stroke layer
        val hasEraser = committedStrokes.any { it.style.tool == ToolType.ERASER }
                     || activeStroke?.style?.tool == ToolType.ERASER
        val layerSave = if (hasEraser) canvas.saveLayer(null, null) else -1

        for (stroke in committedStrokes) {
            BezierSmoother.buildPath(stroke.points)?.let { canvas.drawPath(it, paintForStroke(stroke)) }
        }
        activeStroke?.let { s ->
            BezierSmoother.buildPath(s.points)?.let { canvas.drawPath(it, paintForStroke(s)) }
        }

        if (layerSave != -1) canvas.restoreToCount(layerSave)
        canvas.restore()

        // 3. Scrollbar (screen coords, outside transform)
        drawScrollbar(canvas)

        // 4. Eraser cursor (screen coords, outside transform)
        if (showEraserCursor) {
            // pixel eraser: strokeWidth is in logical coords → screen radius = thickness * scale / 2
            // stroke eraser: hit-test radius is already in screen px = eraserThickness
            val r = if (eraserMode == "stroke") eraserThickness else eraserThickness * scale / 2f
            canvas.drawCircle(eraserCursorX, eraserCursorY, r, strokeEraserFillPaint)
            canvas.drawCircle(eraserCursorX, eraserCursorY, r, strokeEraserBorderPaint)
        }

        if (!scroller.isFinished) postInvalidateOnAnimation()
    }

    // ── Scrollbar ─────────────────────────────────────────────────────────────

    private fun drawScrollbar(canvas: Canvas) {
        val totalH = totalDocHeight * scale
        if (totalH <= height) return
        val thumbH = (height.toFloat() * height / totalH).coerceIn(32f, height.toFloat())
        val thumbY = scrollY / (totalH - height) * (height - thumbH)
        val dp     = resources.displayMetrics.density
        val barW   = if (isScrollbarDragging) 7f * dp else 4f * dp
        val barX   = width - barW - 3f * dp
        val paint  = if (isScrollbarDragging) scrollbarActivePaint else scrollbarPaint
        canvas.drawRoundRect(barX, thumbY, barX + barW, thumbY + thumbH, barW / 2, barW / 2, paint)
    }

    // ── Touch ─────────────────────────────────────────────────────────────────

    override fun onGenericMotionEvent(event: MotionEvent): Boolean {
        if (event.isFromSource(android.view.InputDevice.SOURCE_MOUSE)) {
            return onTouchEvent(event)
        }
        return super.onGenericMotionEvent(event)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        // Scrollbar interaction takes priority over everything
        val isScrollbarDown = event.actionMasked == MotionEvent.ACTION_DOWN && isOnScrollbar(event.x, event.y)
        if (isScrollbarDragging || isScrollbarDown) return handleScrollbar(event)

        // Select mode: all input → scroll/zoom
        if (currentTool == ToolType.SELECT) return handleScroll(event)

        // Draw mode: all input draws (finger scroll only available via SELECT tool)
        return handleDraw(event)
    }

    private fun isOnScrollbar(x: Float, y: Float = -1f): Boolean {
        val totalH = totalDocHeight * scale
        if (totalH <= height) return false
        if (x < width - scrollbarTouchZoneW) return false
        if (y < 0f) return true  // x-only check (used during ongoing drag)
        val thumbH = (height.toFloat() * height / totalH).coerceIn(32f, height.toFloat())
        val thumbY = scrollY / (totalH - height) * (height - thumbH)
        return y in thumbY..(thumbY + thumbH)
    }

    private fun handleScrollbar(event: MotionEvent): Boolean {
        val totalH = totalDocHeight * scale
        if (totalH <= height) return false

        val thumbH = (height.toFloat() * height / totalH).coerceIn(32f, height.toFloat())

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                scroller.abortAnimation()
                isScrollbarDragging = true
                parent?.requestDisallowInterceptTouchEvent(true)
                val thumbY = scrollY / (totalH - height) * (height - thumbH)
                // isOnScrollbar already confirmed touch is on the thumb
                scrollbarThumbOffset = event.y - thumbY
                updateScrollFromThumbY(event.y - scrollbarThumbOffset, thumbH, totalH)
            }
            MotionEvent.ACTION_MOVE -> {
                updateScrollFromThumbY(event.y - scrollbarThumbOffset, thumbH, totalH)
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                isScrollbarDragging = false
                parent?.requestDisallowInterceptTouchEvent(false)
            }
        }
        invalidate()
        return true
    }

    private fun updateScrollFromThumbY(thumbY: Float, thumbH: Float, totalH: Float) {
        val maxThumbY = height - thumbH
        val ratio = (thumbY / maxThumbY).coerceIn(0f, 1f)
        scrollY = ratio * (totalH - height)
        notifyPageChanged()
    }

    private fun handleScroll(event: MotionEvent): Boolean {
        scaleDetector.onTouchEvent(event)

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                scroller.abortAnimation()
                lastTouchX = event.x; lastTouchY = event.y; isDragging = false
                velocityTracker?.recycle()
                velocityTracker = VelocityTracker.obtain()
                velocityTracker?.addMovement(event)
            }
            MotionEvent.ACTION_MOVE -> {
                if (scaleDetector.isInProgress || event.pointerCount > 1) return true
                velocityTracker?.addMovement(event)
                val dx = lastTouchX - event.x
                val dy = lastTouchY - event.y
                if (!isDragging && (Math.abs(dy) > touchSlop || Math.abs(dx) > touchSlop)) {
                    isDragging = true; parent?.requestDisallowInterceptTouchEvent(true)
                }
                if (isDragging) {
                    scrollY    += dy
                    translateX -= dx
                    constrain()
                    lastTouchX = event.x; lastTouchY = event.y
                    notifyPageChanged(); invalidate()
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                if (isDragging && !scaleDetector.isInProgress) {
                    velocityTracker?.addMovement(event)
                    velocityTracker?.computeCurrentVelocity(1000)
                    val vy = -(velocityTracker?.yVelocity ?: 0f)
                    scroller.fling(0, scrollY.toInt(), 0, vy.toInt(), 0, 0, 0, maxScrollY().toInt())
                    postInvalidateOnAnimation()
                }
                velocityTracker?.recycle(); velocityTracker = null
                isDragging = false; parent?.requestDisallowInterceptTouchEvent(false)
            }
        }
        return true
    }

    private fun handleDraw(event: MotionEvent): Boolean {
        val xDoc = toLogicalX(event.x)
        val yDoc = toLogicalY(event.y)
        val pressure = event.pressure.coerceIn(0f, 1f)

        // Stroke-eraser: remove whole strokes on touch instead of drawing an erase path
        if (currentTool == ToolType.ERASER && eraserMode == "stroke") {
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    parent?.requestDisallowInterceptTouchEvent(true)
                    redoStack.clear()
                    strokeEraserBuffer.clear()
                    strokeOriginalIndexMap = committedStrokes.mapIndexed { i, s -> s to i }.toMap()
                    eraserCursorX = event.x; eraserCursorY = event.y; showEraserCursor = true
                    eraseStrokesAtPoint(xDoc, yDoc)
                    notifyUndoRedoState(); invalidate()
                }
                MotionEvent.ACTION_MOVE -> {
                    eraserCursorX = event.x; eraserCursorY = event.y
                    eraseStrokesAtPoint(xDoc, yDoc); invalidate()
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    showEraserCursor = false
                    if (strokeEraserBuffer.isNotEmpty()) {
                        undoStack.add(UndoAction.EraseStrokes(strokeEraserBuffer.toList()))
                        strokeEraserBuffer.clear()
                        strokeOriginalIndexMap = emptyMap()
                    }
                    notifyUndoRedoState(); invalidate()
                }
            }
            return true
        }

        // Pixel-eraser / pen
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                parent?.requestDisallowInterceptTouchEvent(true)
                redoStack.clear()
                if (currentTool == ToolType.ERASER) {
                    eraserCursorX = event.x; eraserCursorY = event.y; showEraserCursor = true
                }
                val style = StrokeStyle(
                    color     = if (currentTool == ToolType.ERASER) Color.TRANSPARENT else penColor,
                    thickness = if (currentTool == ToolType.ERASER) eraserThickness else penThickness,
                    tool      = currentTool,
                )
                activeStroke = Stroke(style = style).also { it.addPoint(Point(xDoc, yDoc, pressure)) }
                notifyUndoRedoState(); invalidate()
            }
            MotionEvent.ACTION_MOVE -> {
                if (currentTool == ToolType.ERASER) {
                    eraserCursorX = event.x; eraserCursorY = event.y
                }
                activeStroke?.addPoint(Point(xDoc, yDoc, pressure)); invalidate()
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                showEraserCursor = false
                activeStroke?.let { s ->
                    s.addPoint(Point(xDoc, yDoc, pressure))
                    if (!s.isEmpty) {
                        committedStrokes.add(s)
                        undoStack.add(UndoAction.AddStroke(s))
                    }
                    activeStroke = null; notifyUndoRedoState()
                }
                invalidate()
            }
        }
        return true
    }

    private fun eraseStrokesAtPoint(xDoc: Float, yDoc: Float) {
        val threshold = eraserThickness / scale
        val thresholdSq = threshold * threshold
        val toRemove = committedStrokes.filter { it.style.tool != ToolType.ERASER && strokeHitsPoint(it, xDoc, yDoc, thresholdSq) }
        if (toRemove.isNotEmpty()) {
            committedStrokes.removeAll(toRemove.toSet())
            toRemove.forEach { stroke ->
                val origIdx = strokeOriginalIndexMap[stroke] ?: 0
                strokeEraserBuffer.add(origIdx to stroke)
            }
        }
    }

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

    override fun computeScroll() {
        if (scroller.computeScrollOffset()) {
            scrollY = scroller.currY.toFloat().coerceIn(0f, maxScrollY())
            notifyPageChanged(); invalidate()
        }
    }

    // ── Undo / Redo / Clear ───────────────────────────────────────────────────

    fun undo() {
        val action = undoStack.removeLastOrNull() ?: return
        when (action) {
            is UndoAction.AddStroke -> committedStrokes.remove(action.stroke)
            is UndoAction.EraseStrokes -> {
                for ((idx, stroke) in action.entries.sortedByDescending { it.first }) {
                    committedStrokes.add(idx.coerceIn(0, committedStrokes.size), stroke)
                }
            }
        }
        redoStack.add(action)
        notifyUndoRedoState(); invalidate()
    }

    fun redo() {
        val action = redoStack.removeLastOrNull() ?: return
        when (action) {
            is UndoAction.AddStroke    -> committedStrokes.add(action.stroke)
            is UndoAction.EraseStrokes -> committedStrokes.removeAll(action.entries.map { it.second }.toSet())
        }
        undoStack.add(action)
        notifyUndoRedoState(); invalidate()
    }

    fun clearCanvas() {
        committedStrokes.clear(); undoStack.clear(); redoStack.clear()
        notifyUndoRedoState(); invalidate()
    }

    // ── Serialization (logical document coordinates) ──────────────────────────

    fun getStrokesJson(): String {
        val arr = JSONArray()
        for (s in committedStrokes) {
            val obj = JSONObject()
            obj.put("tool",      s.style.tool.name)
            obj.put("color",     s.style.color)
            obj.put("thickness", s.style.thickness.toDouble())
            val pts = JSONArray()
            for (p in s.points) pts.put(JSONObject().apply {
                put("x", p.x.toDouble()); put("y", p.y.toDouble()); put("pressure", p.pressure.toDouble())
            })
            obj.put("points", pts); arr.put(obj)
        }
        return arr.toString()
    }

    fun loadStrokesJson(json: String) {
        committedStrokes.clear(); undoStack.clear(); redoStack.clear()
        val arr = JSONArray(json)
        for (i in 0 until arr.length()) {
            val obj  = arr.getJSONObject(i)
            val tool = try { ToolType.valueOf(obj.getString("tool")) } catch (_: Exception) { ToolType.PEN }
            val s    = Stroke(style = StrokeStyle(
                color     = obj.getInt("color"),
                thickness = obj.getDouble("thickness").toFloat(),
                tool      = tool,
            ))
            val pts = obj.getJSONArray("points")
            for (j in 0 until pts.length()) {
                val p = pts.getJSONObject(j)
                s.addPoint(Point(p.getDouble("x").toFloat(), p.getDouble("y").toFloat(), p.getDouble("pressure").toFloat()))
            }
            committedStrokes.add(s)
        }
        notifyUndoRedoState(); invalidate()
    }

    // ── Commands ──────────────────────────────────────────────────────────────

    fun scrollToPage(page: Int) {
        if (pageYOffsets.isEmpty()) return
        val idx = (page - 1).coerceIn(0, pageYOffsets.size - 1)
        scrollY = (pageYOffsets[idx] * scale).coerceIn(0f, maxScrollY())
        notifyPageChanged(); invalidate()
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun paintForStroke(s: Stroke) =
        if (s.style.tool == ToolType.ERASER) eraserPaint.also { it.strokeWidth = s.style.thickness }
        else strokePaint.also { it.color = s.style.color; it.strokeWidth = s.style.thickness }

    private fun getCurrentPage(): Int {
        val logMidY = (scrollY + height / 2f) / scale
        for (i in pageYOffsets.indices.reversed()) { if (logMidY >= pageYOffsets[i]) return i }
        return 0
    }

    private fun notifyPageChanged() {
        val page = getCurrentPage() + 1
        if (page != lastReportedPage) { lastReportedPage = page; onPageChanged?.invoke(page) }
    }

    private fun notifyUndoRedoState() {
        onUndoRedoStateChanged?.invoke(undoStack.isNotEmpty(), redoStack.isNotEmpty())
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        renderExecutor.submit { synchronized(pdfLock) { pdfRenderer?.close(); fileDescriptor?.close() } }
        renderExecutor.shutdown()
    }
}
