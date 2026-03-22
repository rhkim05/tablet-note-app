package com.tabletnoteapp.canvas

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RectF
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
import kotlin.math.abs

class DrawingCanvas(context: Context) : View(context) {

    init {
        // Required for PorterDuff.Mode.CLEAR (eraser) to work — hardware acceleration ignores it
        setLayerType(LAYER_TYPE_SOFTWARE, null)
    }

    // ── Page layout ───────────────────────────────────────────────────────────

    var pageCount = 1
        private set
    private var pageHeightPx = 0f
    private val PAGE_ASPECT = 1.4142f   // A4 portrait
    private val PAGE_GAP get() = (20 * resources.displayMetrics.density)
    var scrollY = 0f
        private set
    private var rawScrollY = 0f         // unclamped, for overscroll detection
    private val scroller = OverScroller(context)
    private var velocityTracker: VelocityTracker? = null
    private var lastScrollTouchY = 0f
    private val OVERSCROLL_THRESHOLD get() = 120 * resources.displayMetrics.density
    private var lastEmittedPage = -1
    private var logicalWidth = 0   // view width at which current stroke coordinates were recorded

    private fun totalDocHeight(): Float {
        if (pageHeightPx == 0f) return height.toFloat().coerceAtLeast(1f)
        return pageCount * pageHeightPx + (pageCount - 1) * PAGE_GAP
    }

    private fun pageTop(i: Int): Float = i * (pageHeightPx + PAGE_GAP)
    private fun pageBottom(i: Int): Float = pageTop(i) + pageHeightPx

    private fun currentPageIndex(): Int {
        if (pageHeightPx == 0f) return 0
        val logMidY = (scrollY + height / 2f) / scale
        return (logMidY / (pageHeightPx + PAGE_GAP)).toInt().coerceIn(0, pageCount - 1)
    }

    // ── Zoom / pan ────────────────────────────────────────────────────────────

    var scale = 1f
    var translateX = 0f
    private var minScale = 0.5f

    private val scaleDetector = ScaleGestureDetector(context,
        object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(d: ScaleGestureDetector): Boolean {
                val newScale = (scale * d.scaleFactor).coerceIn(minScale, 4f)
                val f = newScale / scale
                if (f == 1f) return true
                translateX = d.focusX * (1 - f) + translateX * f
                scrollY    = d.focusY * (f - 1) + scrollY * f
                scale = newScale
                constrain(); emitPageChanged(); invalidate()
                return true
            }
        })

    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop.toFloat()
    private var isDragging = false
    private var lastScrollTouchX = 0f

    private fun maxScrollY() = (totalDocHeight() * scale - height).coerceAtLeast(0f)

    private fun toLogicalX(sx: Float) = (sx - translateX) / scale
    private fun toLogicalY(sy: Float) = (sy + scrollY) / scale

    private fun constrain() {
        scale   = scale.coerceIn(minScale, 4f)
        scrollY = scrollY.coerceIn(0f, maxScrollY())
        translateX = if (scale <= 1f) {
            width * (1f - scale) / 2f    // center page when zoomed out
        } else {
            val minTx = -(width * (scale - 1f))
            translateX.coerceIn(minTx, 0f)
        }
    }

    private fun updateMinScale() {
        if (pageHeightPx > 0f && height > 0) {
            minScale = (height.toFloat() / pageHeightPx * 0.95f).coerceIn(0.1f, 1f)
        }
    }

    // ── State ─────────────────────────────────────────────────────────────────

    private val committedStrokes    = mutableListOf<Stroke>()
    private val undoStack           = mutableListOf<UndoAction>()
    private val redoStack           = mutableListOf<UndoAction>()
    private var activeStroke: Stroke? = null
    private val strokeEraserBuffer  = mutableListOf<Pair<Int, Stroke>>()
    private var strokeOriginalIndexMap: Map<Stroke, Int> = emptyMap()

    // ── Tool settings ─────────────────────────────────────────────────────────

    var penColor: Int               = Color.BLACK
    var penThickness: Float         = 4f
    var eraserThickness: Float      = 24f
    var currentTool: ToolType       = ToolType.PEN
        set(value) {
            if (field == ToolType.SELECT && value != ToolType.SELECT) clearSelection()
            field = value
        }
    var eraserMode: String          = "pixel"   // "pixel" | "stroke"
    var highlighterColor: Int       = Color.YELLOW
    var highlighterThickness: Float = 16f

    // ── Callbacks ─────────────────────────────────────────────────────────────

    var onUndoRedoStateChanged: ((canUndo: Boolean, canRedo: Boolean) -> Unit)? = null
    var onEraserLift: (() -> Unit)? = null
    var onSelectionChanged: ((hasSelection: Boolean, count: Int, bounds: RectF) -> Unit)? = null
    var onPageChanged: ((page: Int) -> Unit)? = null
    var onPageCountChanged: ((total: Int) -> Unit)? = null

    // ── Rendering ─────────────────────────────────────────────────────────────

    private var bitmap: Bitmap? = null
    private var bitmapCanvas: Canvas? = null

    private val viewBgPaint = Paint().apply { color = Color.parseColor("#E0E0E0") }
    private val pageBgPaint = Paint().apply { color = Color.WHITE }

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

    private val highlighterPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        alpha = 120  // ~47% opacity — like a real highlighter
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

    // ── Selector state (retained; SELECT tool currently scrolls) ──────────────

    private enum class SelectState { IDLE, DRAWING, SELECTED, MOVING, RESIZING }
    private var selectState = SelectState.IDLE
    private val selectionDragRect = RectF()
    private val selectedIndices   = mutableSetOf<Int>()
    private val selectionBounds   = RectF()
    private var moveStartX = 0f
    private var moveStartY = 0f
    private var resizeHandleIndex = -1
    private val HANDLE_RADIUS = 28f
    private val SELECTION_PADDING = 12f

    private val selectionDragPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = 2f
        color = Color.argb(200, 30, 120, 255)
        pathEffect = DashPathEffect(floatArrayOf(12f, 8f), 0f)
    }
    private val selectionBoundsPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = 2f
        color = Color.argb(220, 30, 120, 255)
        pathEffect = DashPathEffect(floatArrayOf(12f, 8f), 0f)
    }
    private val selectionFillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL; color = Color.argb(25, 30, 120, 255)
    }
    private val handleFillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL; color = Color.WHITE
    }
    private val handleBorderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = 2.5f
        color = Color.argb(220, 30, 120, 255)
    }
    private val selectedStrokeOverlayPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
        color = Color.argb(80, 30, 120, 255)
    }

    // ── View lifecycle ────────────────────────────────────────────────────────

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w == 0) return
        val fromScratch = oldw != 0 && w != oldw
        // Rescale all stroke coordinates so they stay at the same relative position on the page
        if (fromScratch && logicalWidth > 0 && w != logicalWidth) {
            scaleAllCoordinates(w.toFloat() / logicalWidth)
        }
        logicalWidth = w
        reLayoutPages(w, fromScratch)
    }

    // Scale every stored coordinate (strokes, scroll, undo/redo stack) by ratio when the
    // view width changes (e.g. orientation change). Must be called before reLayoutPages.
    private fun scaleAllCoordinates(ratio: Float) {
        val logCenterYOld = if (scale > 0f) (scrollY + height / 2f) / scale else 0f

        // Page heights scale with view width; inter-page gaps are fixed physical dp and do NOT
        // scale. Simple y*ratio accumulates an error of N*gap*(1-ratio) per page N.
        // Fix: remap within each page (scales by ratio), then re-add the unchanged gaps.
        val oldPageH = pageHeightPx   // reLayoutPages hasn't run yet — still the old value
        val gap      = PAGE_GAP

        fun remapY(y: Float): Float {
            if (oldPageH + gap <= 0f) return y * ratio
            val pageIdx = (y / (oldPageH + gap)).toInt().coerceAtLeast(0)
            val yInPage = y - pageIdx * (oldPageH + gap)
            return pageIdx * (oldPageH * ratio + gap) + yInPage * ratio
        }

        for (stroke in committedStrokes) {
            for (i in stroke.points.indices) {
                val p = stroke.points[i]
                stroke.points[i] = p.copy(x = p.x * ratio, y = remapY(p.y))
            }
            // Pen/highlighter thickness is page-relative → scale with ratio.
            // Eraser thickness is screen-relative → leave unchanged.
            if (stroke.style.tool != ToolType.ERASER) {
                stroke.style = stroke.style.copy(thickness = stroke.style.thickness * ratio)
            }
        }

        // Restore scroll so the same content stays at screen centre.
        scrollY    = remapY(logCenterYOld) * scale - height / 2f
        rawScrollY = scrollY

        for (i in undoStack.indices) undoStack[i] = scaleUndoAction(undoStack[i], ratio)
        for (i in redoStack.indices) redoStack[i] = scaleUndoAction(redoStack[i], ratio)
        if (!selectionBounds.isEmpty) {
            selectionBounds.set(
                selectionBounds.left  * ratio, remapY(selectionBounds.top),
                selectionBounds.right * ratio, remapY(selectionBounds.bottom),
            )
        }
    }

    private fun scaleUndoAction(action: UndoAction, ratio: Float): UndoAction = when (action) {
        is UndoAction.AddStroke     -> action  // stroke points already scaled above
        is UndoAction.EraseStrokes  -> action  // stroke points already scaled above
        is UndoAction.MoveStrokes   -> action.copy(dx = action.dx * ratio, dy = action.dy * ratio)
        is UndoAction.ResizeStrokes -> action.copy(pivotX = action.pivotX * ratio, pivotY = action.pivotY * ratio)
    }

    private fun reLayoutPages(viewWidth: Int, fromScratch: Boolean = false) {
        pageHeightPx = viewWidth * PAGE_ASPECT
        updateMinScale()
        val docH = totalDocHeight().coerceAtLeast(1f).toInt()
        val newBitmap = Bitmap.createBitmap(viewWidth, docH, Bitmap.Config.ARGB_8888)
        val newCanvas = Canvas(newBitmap)
        if (!fromScratch && bitmap != null) {
            bitmap?.let { newCanvas.drawBitmap(it, 0f, 0f, null) }
        } else if (committedStrokes.isNotEmpty()) {
            val clipPath = buildPageClipPath()
            for (stroke in committedStrokes) {
                val path = BezierSmoother.buildPath(stroke.points) ?: continue
                newCanvas.save()
                newCanvas.clipPath(clipPath)
                newCanvas.drawPath(path, paintForStroke(stroke))
                newCanvas.restore()
            }
        }
        bitmap?.recycle()
        bitmap = newBitmap
        bitmapCanvas = newCanvas
        scrollY = scrollY.coerceIn(0f, maxScrollY())
        rawScrollY = scrollY
        invalidate()
        notifyUndoRedoState()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        // 1. Grey background (full view, screen coords)
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), viewBgPaint)

        canvas.save()
        canvas.translate(translateX, -scrollY)
        canvas.scale(scale, scale)

        // 2. White page rects (logical coords, visible-only)
        for (i in 0 until pageCount) {
            val top = pageTop(i); val bottom = pageBottom(i)
            if (bottom * scale <= scrollY || top * scale >= scrollY + height) continue
            canvas.drawRect(0f, top, width.toFloat(), bottom, pageBgPaint)
        }

        // 3. Clip to pages → strokes cannot appear in grey gaps
        canvas.save()
        canvas.clipPath(buildPageClipPath())

        // 4. Eraser saveLayer (CLEAR holes reveal white page, not grey)
        val isEraserActive = activeStroke?.style?.tool == ToolType.ERASER
        val layerSave = if (isEraserActive) canvas.saveLayer(null, null) else -1

        bitmap?.let { canvas.drawBitmap(it, 0f, 0f, null) }
        activeStroke?.let { stroke ->
            BezierSmoother.buildPath(stroke.points)?.let { canvas.drawPath(it, paintForStroke(stroke)) }
        }

        if (layerSave != -1) canvas.restoreToCount(layerSave)
        canvas.restore()  // remove page clip

        canvas.restore()  // remove translate + scale

        // 5. Eraser cursor — fixed screen size regardless of zoom
        if (showEraserCursor) {
            val r = eraserThickness / 2f
            canvas.drawCircle(eraserCursorX, eraserCursorY, r, strokeEraserFillPaint)
            canvas.drawCircle(eraserCursorX, eraserCursorY, r, strokeEraserBorderPaint)
        }

        // 6. Selector overlays (logical space + clip)
        canvas.save()
        canvas.translate(translateX, -scrollY)
        canvas.scale(scale, scale)
        canvas.clipPath(buildPageClipPath())
        when (selectState) {
            SelectState.DRAWING -> {
                canvas.drawRect(selectionDragRect, selectionFillPaint)
                canvas.drawRect(selectionDragRect, selectionDragPaint)
            }
            SelectState.SELECTED, SelectState.MOVING, SelectState.RESIZING -> {
                for (idx in selectedIndices) {
                    val stroke = committedStrokes.getOrNull(idx) ?: continue
                    val path = BezierSmoother.buildPath(stroke.points) ?: continue
                    selectedStrokeOverlayPaint.strokeWidth = stroke.style.thickness + 4f
                    canvas.drawPath(path, selectedStrokeOverlayPaint)
                }
                canvas.drawRect(selectionBounds, selectionFillPaint)
                canvas.drawRect(selectionBounds, selectionBoundsPaint)
                drawHandle(canvas, selectionBounds.left,  selectionBounds.top)
                drawHandle(canvas, selectionBounds.right, selectionBounds.top)
                drawHandle(canvas, selectionBounds.right, selectionBounds.bottom)
                drawHandle(canvas, selectionBounds.left,  selectionBounds.bottom)
            }
            else -> {}
        }
        canvas.restore()
    }

    private fun buildPageClipPath(): Path {
        val path = Path()
        for (i in 0 until pageCount) {
            path.addRect(0f, pageTop(i), width.toFloat(), pageBottom(i), Path.Direction.CW)
        }
        return path
    }

    private fun drawHandle(canvas: Canvas, x: Float, y: Float) {
        canvas.drawCircle(x, y, HANDLE_RADIUS, handleFillPaint)
        canvas.drawCircle(x, y, HANDLE_RADIUS, handleBorderPaint)
    }

    override fun computeScroll() {
        if (scroller.computeScrollOffset()) {
            scrollY = scroller.currY.toFloat().coerceIn(0f, maxScrollY())
            emitPageChanged()
            invalidate()
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
        // Finger always scrolls/pans regardless of active tool.
        // Stylus (pen tip or eraser end) uses the active tool.
        val isFinger = event.getToolType(0) == MotionEvent.TOOL_TYPE_FINGER
        when {
            isFinger || currentTool == ToolType.SCROLL -> handleScroll(event)
            currentTool == ToolType.SELECT             -> handleSelect(event)
            else                                       -> handleDraw(event)
        }
        return true
    }

    // ── Scroll handling (SELECT tool) ─────────────────────────────────────────

    private fun handleScroll(event: MotionEvent) {
        scaleDetector.onTouchEvent(event)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                scroller.forceFinished(true)
                velocityTracker?.recycle()
                velocityTracker = VelocityTracker.obtain()
                velocityTracker!!.addMovement(event)
                lastScrollTouchX = event.x; lastScrollTouchY = event.y
                rawScrollY = scrollY; isDragging = false
                parent?.requestDisallowInterceptTouchEvent(true)
            }
            MotionEvent.ACTION_MOVE -> {
                if (scaleDetector.isInProgress || event.pointerCount > 1) return
                velocityTracker?.addMovement(event)
                val dx = lastScrollTouchX - event.x
                val dy = lastScrollTouchY - event.y
                if (!isDragging && (abs(dx) > touchSlop || abs(dy) > touchSlop)) isDragging = true
                if (isDragging) {
                    rawScrollY += dy; translateX -= dx
                    lastScrollTouchX = event.x; lastScrollTouchY = event.y
                    scrollY = rawScrollY.coerceIn(-OVERSCROLL_THRESHOLD, maxScrollY() + OVERSCROLL_THRESHOLD)
                    constrain(); emitPageChanged(); invalidate()
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                when {
                    rawScrollY > maxScrollY() + OVERSCROLL_THRESHOLD -> addPage(atTop = false)
                    rawScrollY < -OVERSCROLL_THRESHOLD               -> addPage(atTop = true)
                    isDragging && !scaleDetector.isInProgress -> {
                        velocityTracker?.addMovement(event)
                        velocityTracker?.computeCurrentVelocity(1000)
                        val vy = -(velocityTracker?.yVelocity ?: 0f)
                        scroller.fling(0, scrollY.toInt(), 0, vy.toInt(), 0, 0, 0, maxScrollY().toInt(), 0, 0)
                        invalidate()
                    }
                }
                velocityTracker?.recycle(); velocityTracker = null; isDragging = false
            }
        }
    }

    private fun addPage(atTop: Boolean) {
        if (atTop) {
            val shift = pageHeightPx + PAGE_GAP
            for (stroke in committedStrokes) {
                for (i in stroke.points.indices) {
                    stroke.points[i] = stroke.points[i].copy(y = stroke.points[i].y + shift)
                }
            }
            scrollY = (scrollY + shift * scale).coerceAtLeast(0f)
            rawScrollY = scrollY
            undoStack.clear()
            redoStack.clear()
            notifyUndoRedoState()
        }
        pageCount++
        onPageCountChanged?.invoke(pageCount)
        redrawBitmap()
        emitPageChanged()
    }

    private fun emitPageChanged() {
        val page = currentPageIndex()
        if (page != lastEmittedPage) {
            lastEmittedPage = page
            onPageChanged?.invoke(page)
        }
    }

    // ── Select handling (SELECT tool — lasso, move, resize) ──────────────────

    private fun handleSelect(event: MotionEvent) {
        val xDoc = toLogicalX(event.x)
        val yDoc = toLogicalY(event.y)

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                parent?.requestDisallowInterceptTouchEvent(true)
                val handleIdx = hitTestHandle(xDoc, yDoc)
                when {
                    handleIdx >= 0 && selectState == SelectState.SELECTED -> {
                        selectState = SelectState.RESIZING
                        resizeHandleIndex = handleIdx
                        moveStartX = xDoc; moveStartY = yDoc
                    }
                    selectState == SelectState.SELECTED && selectionBounds.contains(xDoc, yDoc) -> {
                        selectState = SelectState.MOVING
                        moveStartX = xDoc; moveStartY = yDoc
                    }
                    else -> {
                        clearSelection()
                        selectState = SelectState.DRAWING
                        selectionDragRect.set(xDoc, yDoc, xDoc, yDoc)
                    }
                }
                invalidate()
            }
            MotionEvent.ACTION_MOVE -> {
                when (selectState) {
                    SelectState.DRAWING -> {
                        selectionDragRect.right = xDoc
                        selectionDragRect.bottom = yDoc
                        invalidate()
                    }
                    SelectState.MOVING -> {
                        val dx = xDoc - moveStartX; val dy = yDoc - moveStartY
                        moveStartX = xDoc; moveStartY = yDoc
                        translateSelectedStrokes(dx, dy)
                    }
                    SelectState.RESIZING -> {
                        val dx = xDoc - moveStartX; val dy = yDoc - moveStartY
                        moveStartX = xDoc; moveStartY = yDoc
                        resizeSelectedStrokes(resizeHandleIndex, dx, dy)
                    }
                    else -> {}
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                when (selectState) {
                    SelectState.DRAWING -> {
                        // Normalize rect in case user dragged up or left
                        selectionDragRect.set(
                            minOf(selectionDragRect.left, selectionDragRect.right),
                            minOf(selectionDragRect.top,  selectionDragRect.bottom),
                            maxOf(selectionDragRect.left, selectionDragRect.right),
                            maxOf(selectionDragRect.top,  selectionDragRect.bottom),
                        )
                        computeSelection()
                        selectState = if (selectedIndices.isNotEmpty()) SelectState.SELECTED else SelectState.IDLE
                        emitSelectionChanged()
                    }
                    SelectState.MOVING -> {
                        pushMoveUndoAction()
                        selectState = SelectState.SELECTED
                        emitSelectionChanged()
                    }
                    SelectState.RESIZING -> {
                        pushResizeUndoAction()
                        selectState = SelectState.SELECTED
                        emitSelectionChanged()
                    }
                    else -> {}
                }
                invalidate()
            }
        }
    }

    // ── Draw handling (pen / eraser / highlighter) ────────────────────────────

    private fun handleDraw(event: MotionEvent) {
        // Convert screen coords to document coords via zoom transform
        val xDoc = toLogicalX(event.x)
        val yDoc = toLogicalY(event.y)
        val rawPressure = event.pressure.coerceIn(0f, 1f)
        val pressure = if (event.getToolType(0) == MotionEvent.TOOL_TYPE_MOUSE) 1f else rawPressure

        // ── Stroke-eraser mode ────────────────────────────────────────────────
        if (currentTool == ToolType.ERASER && eraserMode == "stroke") {
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    parent?.requestDisallowInterceptTouchEvent(true)
                    redoStack.clear()
                    strokeEraserBuffer.clear()
                    strokeOriginalIndexMap = committedStrokes.mapIndexed { i, s -> s to i }.toMap()
                    eraserCursorX = event.x; eraserCursorY = event.y; showEraserCursor = true
                    eraseStrokesAtPoint(xDoc, yDoc)
                    notifyUndoRedoState()
                    invalidate()
                }
                MotionEvent.ACTION_MOVE -> {
                    eraserCursorX = event.x; eraserCursorY = event.y
                    eraseStrokesAtPoint(xDoc, yDoc)
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
            return
        }

        // ── Pixel-eraser / pen / highlighter ─────────────────────────────────
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                parent?.requestDisallowInterceptTouchEvent(true)
                redoStack.clear()
                if (currentTool == ToolType.ERASER) {
                    eraserCursorX = event.x; eraserCursorY = event.y; showEraserCursor = true
                }
                val (color, thickness, tool) = when (currentTool) {
                    ToolType.ERASER      -> Triple(Color.TRANSPARENT, eraserThickness / scale, ToolType.ERASER)
                    ToolType.HIGHLIGHTER -> Triple(highlighterColor, highlighterThickness, ToolType.HIGHLIGHTER)
                    else                 -> Triple(penColor, penThickness, ToolType.PEN)
                }
                activeStroke = Stroke(style = StrokeStyle(color, thickness, tool)).also {
                    it.addPoint(Point(xDoc, yDoc, pressure))
                }
                notifyUndoRedoState()
                invalidate()
            }
            MotionEvent.ACTION_MOVE -> {
                if (currentTool == ToolType.ERASER) {
                    eraserCursorX = event.x; eraserCursorY = event.y
                }
                activeStroke?.let { stroke ->
                    stroke.addPoint(Point(xDoc, yDoc, pressure))
                    invalidate()
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                showEraserCursor = false
                activeStroke?.let { stroke ->
                    stroke.addPoint(Point(xDoc, yDoc, pressure))
                    commitStroke(stroke)
                    activeStroke = null
                    notifyUndoRedoState()
                    if (currentTool == ToolType.ERASER) onEraserLift?.invoke()
                }
            }
        }
    }

    // ── Selector helpers (retained for future fix) ────────────────────────────

    private var accumulatedMoveX = 0f
    private var accumulatedMoveY = 0f
    private var accumulatedScaleX = 1f
    private var accumulatedScaleY = 1f
    private var resizePivotX = 0f
    private var resizePivotY = 0f

    private fun computeSelection() {
        selectedIndices.clear()
        val rect = selectionDragRect
        for ((i, stroke) in committedStrokes.withIndex()) {
            if (stroke.points.any { p -> rect.contains(p.x, p.y) }) selectedIndices.add(i)
        }
        if (selectedIndices.isNotEmpty()) updateSelectionBounds()
    }

    private fun updateSelectionBounds() {
        val bounds = computeBoundsOf(selectedIndices)
        selectionBounds.set(
            bounds.left   - SELECTION_PADDING,
            bounds.top    - SELECTION_PADDING,
            bounds.right  + SELECTION_PADDING,
            bounds.bottom + SELECTION_PADDING,
        )
    }

    private fun computeBoundsOf(indices: Set<Int>): RectF {
        var minX = Float.MAX_VALUE; var minY = Float.MAX_VALUE
        var maxX = Float.MIN_VALUE; var maxY = Float.MIN_VALUE
        for (idx in indices) {
            for (p in (committedStrokes.getOrNull(idx) ?: continue).points) {
                if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y
                if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y
            }
        }
        return RectF(minX, minY, maxX, maxY)
    }

    private fun hitTestHandle(x: Float, y: Float): Int {
        val corners = listOf(
            selectionBounds.left  to selectionBounds.top,
            selectionBounds.right to selectionBounds.top,
            selectionBounds.right to selectionBounds.bottom,
            selectionBounds.left  to selectionBounds.bottom,
        )
        val hitRadius = HANDLE_RADIUS * 2.5f
        for ((i, corner) in corners.withIndex()) {
            val dx = x - corner.first; val dy = y - corner.second
            if (dx * dx + dy * dy <= hitRadius * hitRadius) return i
        }
        return -1
    }

    private fun translateSelectedStrokes(dx: Float, dy: Float) {
        accumulatedMoveX += dx; accumulatedMoveY += dy
        for (idx in selectedIndices) {
            val stroke = committedStrokes.getOrNull(idx) ?: continue
            for (i in stroke.points.indices) {
                val p = stroke.points[i]
                stroke.points[i] = p.copy(x = p.x + dx, y = p.y + dy)
            }
        }
        updateSelectionBounds()
        redrawBitmap()
    }

    private fun resizeSelectedStrokes(handleIdx: Int, dx: Float, dy: Float) {
        val pivotX = if (handleIdx == 0 || handleIdx == 3) selectionBounds.right else selectionBounds.left
        val pivotY = if (handleIdx == 0 || handleIdx == 1) selectionBounds.bottom else selectionBounds.top
        resizePivotX = pivotX; resizePivotY = pivotY
        val w = selectionBounds.width().takeIf { it > 0f } ?: return
        val h = selectionBounds.height().takeIf { it > 0f } ?: return
        val safeScaleX = (1f + dx / w).coerceIn(0.1f, 10f)
        val safeScaleY = (1f + dy / h).coerceIn(0.1f, 10f)
        accumulatedScaleX *= safeScaleX; accumulatedScaleY *= safeScaleY
        for (idx in selectedIndices) {
            val stroke = committedStrokes.getOrNull(idx) ?: continue
            for (i in stroke.points.indices) {
                val p = stroke.points[i]
                stroke.points[i] = p.copy(
                    x = pivotX + (p.x - pivotX) * safeScaleX,
                    y = pivotY + (p.y - pivotY) * safeScaleY,
                )
            }
        }
        updateSelectionBounds()
        redrawBitmap()
    }

    private fun pushMoveUndoAction() {
        if (accumulatedMoveX == 0f && accumulatedMoveY == 0f) return
        undoStack.add(UndoAction.MoveStrokes(selectedIndices.toList(), accumulatedMoveX, accumulatedMoveY))
        redoStack.clear(); accumulatedMoveX = 0f; accumulatedMoveY = 0f
        notifyUndoRedoState()
    }

    private fun pushResizeUndoAction() {
        if (accumulatedScaleX == 1f && accumulatedScaleY == 1f) return
        undoStack.add(UndoAction.ResizeStrokes(
            selectedIndices.toList(), accumulatedScaleX, accumulatedScaleY, resizePivotX, resizePivotY,
        ))
        redoStack.clear(); accumulatedScaleX = 1f; accumulatedScaleY = 1f
        notifyUndoRedoState()
    }

    private fun clearSelection() {
        selectedIndices.clear(); selectionBounds.setEmpty()
        selectState = SelectState.IDLE
        accumulatedMoveX = 0f; accumulatedMoveY = 0f
        accumulatedScaleX = 1f; accumulatedScaleY = 1f
        emitSelectionChanged()
    }

    private fun emitSelectionChanged() {
        onSelectionChanged?.invoke(selectedIndices.isNotEmpty(), selectedIndices.size, RectF(selectionBounds))
    }

    fun deleteSelected() {
        if (selectedIndices.isEmpty()) return
        val entries = selectedIndices.sortedDescending().map { idx -> idx to committedStrokes[idx] }
        for ((idx, _) in entries) committedStrokes.removeAt(idx)
        undoStack.add(UndoAction.EraseStrokes(entries.map { (i, s) -> i to s }))
        redoStack.clear(); clearSelection(); redrawBitmap(); notifyUndoRedoState()
    }

    fun getSelectedStrokesJson(): String {
        val arr = JSONArray()
        for (idx in selectedIndices) {
            val stroke = committedStrokes.getOrNull(idx) ?: continue
            arr.put(strokeToJson(stroke))
        }
        return arr.toString()
    }

    fun captureSelection(): String {
        if (selectionBounds.isEmpty) return ""
        val bmp = bitmap ?: return ""
        val padding = SELECTION_PADDING.toInt()
        val left   = (selectionBounds.left   - padding).coerceAtLeast(0f).toInt()
        val top    = (selectionBounds.top    - padding).coerceAtLeast(0f).toInt()
        val right  = (selectionBounds.right  + padding).coerceAtMost(bmp.width.toFloat()).toInt()
        val bottom = (selectionBounds.bottom + padding).coerceAtMost(bmp.height.toFloat()).toInt()
        val w = right - left; val h = bottom - top
        if (w <= 0 || h <= 0) return ""
        val captureBitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val captureCanvas = Canvas(captureBitmap)
        captureCanvas.drawColor(Color.WHITE)
        captureCanvas.drawBitmap(bmp, -left.toFloat(), -top.toFloat(), null)
        val file = java.io.File(context.cacheDir, "selection_capture_${System.currentTimeMillis()}.png")
        file.outputStream().use { captureBitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        captureBitmap.recycle()
        return file.absolutePath
    }

    // ── Stroke-eraser hit test ────────────────────────────────────────────────

    private fun eraseStrokesAtPoint(x: Float, y: Float) {
        val t = eraserThickness / (2f * scale)
        val thresholdSq = t * t
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
        bitmapCanvas?.save()
        bitmapCanvas?.clipPath(buildPageClipPath())
        bitmapCanvas?.drawPath(path, paintForStroke(stroke))
        bitmapCanvas?.restore()
        invalidate()
    }

    // ── Undo / Redo ───────────────────────────────────────────────────────────

    fun undo() {
        val action = undoStack.removeLastOrNull() ?: return
        when (action) {
            is UndoAction.AddStroke -> committedStrokes.remove(action.stroke)
            is UndoAction.EraseStrokes -> {
                for ((idx, stroke) in action.entries.sortedByDescending { it.first }) {
                    committedStrokes.add(idx.coerceIn(0, committedStrokes.size), stroke)
                }
            }
            is UndoAction.MoveStrokes -> {
                for (idx in action.indices) {
                    val stroke = committedStrokes.getOrNull(idx) ?: continue
                    for (i in stroke.points.indices) {
                        val p = stroke.points[i]
                        stroke.points[i] = p.copy(x = p.x - action.dx, y = p.y - action.dy)
                    }
                }
                updateSelectionBounds()
            }
            is UndoAction.ResizeStrokes -> {
                for (idx in action.indices) {
                    val stroke = committedStrokes.getOrNull(idx) ?: continue
                    for (i in stroke.points.indices) {
                        val p = stroke.points[i]
                        stroke.points[i] = p.copy(
                            x = action.pivotX + (p.x - action.pivotX) / action.scaleX,
                            y = action.pivotY + (p.y - action.pivotY) / action.scaleY,
                        )
                    }
                }
                updateSelectionBounds()
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
                if (path != null) {
                    bitmapCanvas?.save()
                    bitmapCanvas?.clipPath(buildPageClipPath())
                    bitmapCanvas?.drawPath(path, paintForStroke(action.stroke))
                    bitmapCanvas?.restore()
                } else redrawBitmap()
                invalidate()
            }
            is UndoAction.EraseStrokes -> {
                committedStrokes.removeAll(action.entries.map { it.second }.toSet())
                redrawBitmap()
            }
            is UndoAction.MoveStrokes -> {
                for (idx in action.indices) {
                    val stroke = committedStrokes.getOrNull(idx) ?: continue
                    for (i in stroke.points.indices) {
                        val p = stroke.points[i]
                        stroke.points[i] = p.copy(x = p.x + action.dx, y = p.y + action.dy)
                    }
                }
                redrawBitmap(); updateSelectionBounds()
            }
            is UndoAction.ResizeStrokes -> {
                for (idx in action.indices) {
                    val stroke = committedStrokes.getOrNull(idx) ?: continue
                    for (i in stroke.points.indices) {
                        val p = stroke.points[i]
                        stroke.points[i] = p.copy(
                            x = action.pivotX + (p.x - action.pivotX) * action.scaleX,
                            y = action.pivotY + (p.y - action.pivotY) * action.scaleY,
                        )
                    }
                }
                redrawBitmap(); updateSelectionBounds()
            }
        }
        undoStack.add(action)
        notifyUndoRedoState()
    }

    fun canUndo() = undoStack.isNotEmpty()
    fun canRedo() = redoStack.isNotEmpty()

    private fun redrawBitmap() {
        val w = width; if (w == 0) return
        val docH = totalDocHeight().coerceAtLeast(1f).toInt()
        val newBitmap = Bitmap.createBitmap(w, docH, Bitmap.Config.ARGB_8888)
        val newCanvas = Canvas(newBitmap)
        val clipPath = buildPageClipPath()
        for (stroke in committedStrokes) {
            val path = BezierSmoother.buildPath(stroke.points) ?: continue
            newCanvas.save()
            newCanvas.clipPath(clipPath)
            newCanvas.drawPath(path, paintForStroke(stroke))
            newCanvas.restore()
        }
        bitmap?.recycle()
        bitmap = newBitmap
        bitmapCanvas = newCanvas
        invalidate()
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun paintForStroke(stroke: Stroke): Paint {
        return when (stroke.style.tool) {
            ToolType.ERASER -> eraserPaint.also { it.strokeWidth = stroke.style.thickness }
            ToolType.HIGHLIGHTER -> highlighterPaint.also {
                it.color = stroke.style.color
                it.alpha = 120
                it.strokeWidth = stroke.style.thickness
            }
            else -> strokePaint.also {
                it.color = stroke.style.color
                it.strokeWidth = stroke.style.thickness
            }
        }
    }

    private fun notifyUndoRedoState() {
        onUndoRedoStateChanged?.invoke(canUndo(), canRedo())
    }

    fun applyScale(s: Float) {
        scale = s; constrain(); invalidate()
    }

    fun scrollToPage(page: Int) {
        val target = pageTop(page.coerceIn(0, pageCount - 1)) * scale
        scrollY = target.coerceIn(0f, maxScrollY())
        rawScrollY = scrollY
        emitPageChanged()
        invalidate()
    }

    fun clearCanvas() {
        committedStrokes.clear()
        undoStack.clear()
        redoStack.clear()
        clearSelection()
        pageCount = 1
        scrollY = 0f
        rawScrollY = 0f
        lastEmittedPage = -1
        onPageCountChanged?.invoke(pageCount)
        redrawBitmap()
        notifyUndoRedoState()
    }

    // ── Serialization ─────────────────────────────────────────────────────────

    fun getStrokesJson(): String {
        val obj = JSONObject()
        obj.put("version", 2)
        obj.put("pageCount", pageCount)
        val arr = JSONArray()
        for (stroke in committedStrokes) arr.put(strokeToJson(stroke))
        obj.put("strokes", arr)
        return obj.toString()
    }

    private fun strokeToJson(stroke: Stroke): JSONObject {
        val obj = JSONObject()
        obj.put("tool", stroke.style.tool.name)
        obj.put("color", stroke.style.color)
        obj.put("thickness", stroke.style.thickness.toDouble())
        val pts = JSONArray()
        for (p in stroke.points) {
            pts.put(JSONObject().apply {
                put("x", p.x.toDouble())
                put("y", p.y.toDouble())
                put("pressure", p.pressure.toDouble())
            })
        }
        obj.put("points", pts)
        return obj
    }

    fun loadStrokesJson(json: String) {
        committedStrokes.clear()
        undoStack.clear()
        redoStack.clear()
        clearSelection()

        val arr: JSONArray
        if (json.trimStart().startsWith('{')) {
            // v2 format: { "version": 2, "pageCount": N, "strokes": [...] }
            val obj = JSONObject(json)
            pageCount = obj.optInt("pageCount", 1).coerceAtLeast(1)
            arr = obj.optJSONArray("strokes") ?: JSONArray()
        } else {
            // v1 format: flat array, screen-space coords → single page
            pageCount = 1
            arr = JSONArray(json)
        }

        for (i in 0 until arr.length()) {
            val obj = arr.getJSONObject(i)
            val tool = try { ToolType.valueOf(obj.getString("tool")) } catch (e: Exception) { ToolType.PEN }
            val style = StrokeStyle(
                color     = obj.getInt("color"),
                thickness = obj.getDouble("thickness").toFloat(),
                tool      = tool,
            )
            val stroke = Stroke(style = style)
            val pts = obj.getJSONArray("points")
            for (j in 0 until pts.length()) {
                val pt = pts.getJSONObject(j)
                stroke.addPoint(Point(
                    x        = pt.getDouble("x").toFloat(),
                    y        = pt.getDouble("y").toFloat(),
                    pressure = pt.getDouble("pressure").toFloat(),
                ))
            }
            committedStrokes.add(stroke)
        }

        lastEmittedPage = -1
        onPageCountChanged?.invoke(pageCount)
        // Recreate bitmap at new doc height (pageHeightPx already set via onSizeChanged)
        redrawBitmap()
        notifyUndoRedoState()
    }
}
