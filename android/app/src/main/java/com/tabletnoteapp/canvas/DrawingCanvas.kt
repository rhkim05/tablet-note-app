package com.tabletnoteapp.canvas

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RectF
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.widget.OverScroller
import com.tabletnoteapp.canvas.models.Point
import com.tabletnoteapp.canvas.models.Shape
import com.tabletnoteapp.canvas.models.ShapeType
import com.tabletnoteapp.canvas.models.Stroke
import com.tabletnoteapp.canvas.models.StrokeStyle
import com.tabletnoteapp.canvas.models.TextElement
import com.tabletnoteapp.canvas.models.ToolType
import com.tabletnoteapp.canvas.models.UndoAction
import com.tabletnoteapp.canvas.utils.BezierSmoother
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

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
    private val textElements        = mutableListOf<TextElement>()
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
    var onTextTap: ((docX: Float, docY: Float, docW: Float, docH: Float, screenX: Float, screenY: Float, screenW: Float, screenH: Float) -> Unit)? = null
    var onTextEditTap: ((TextElement, screenX: Float, screenY: Float, screenW: Float, screenH: Float) -> Unit)? = null

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

    private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG)

    private val textBoxBorderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = 1.5f
        color = Color.argb(200, 30, 120, 255)
        pathEffect = DashPathEffect(floatArrayOf(10f, 6f), 0f)
    }
    private val textBoxFillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = Color.argb(15, 30, 120, 255)
    }

    // Text drag state
    private var textDragStartX = 0f
    private var textDragStartY = 0f
    private var textDragStartScreenX = 0f
    private var textDragStartScreenY = 0f
    private val textDragRect = RectF()
    private var isTextDragging = false

    // Active / pending text box state
    private var activeTextId: String? = null     // element currently being edited (shows border)
    private var pendingBoxRect: RectF? = null    // drawn but not yet committed (no element yet)

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

    // ── Laser state ────────────────────────────────────────────────────────────

    var laserColor: Int = Color.RED
    private val laserPoints = mutableListOf<android.graphics.PointF>()
    // Outer blurred glow
    private val laserGlowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.BUTT; strokeJoin = Paint.Join.ROUND
        strokeWidth = 22f
        maskFilter = BlurMaskFilter(14f, BlurMaskFilter.Blur.NORMAL)
    }
    // Crisp bright core
    private val laserCorePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.BUTT; strokeJoin = Paint.Join.ROUND
        strokeWidth = 3.5f
    }
    // White hot-spot dot at the tip
    private val laserHotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = Color.WHITE
    }
    private var laserFadeStart = 0L
    private val LASER_FADE_MS  = 600L

    // ── Shape state ────────────────────────────────────────────────────────────

    var currentShapeType: ShapeType = ShapeType.LINE
    var shapeColor: Int = Color.BLACK
    var shapeThickness: Float = 4f
    private val committedShapes = mutableListOf<Shape>()
    private var activeShape: Shape? = null   // live preview while dragging

    private val shapePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val shapeArrowFillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }

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

        for (el in textElements) {
            el.x = el.x * ratio
            el.y = remapY(el.y)
            el.width = el.width * ratio
            el.height = el.height * ratio
            el.fontSize = el.fontSize * ratio
        }

        // Restore scroll so the same content stays at screen centre.
        scrollY    = remapY(logCenterYOld) * scale - height / 2f
        rawScrollY = scrollY

        for (shape in committedShapes) {
            shape.x1 *= ratio; shape.y1 = remapY(shape.y1)
            shape.x2 *= ratio; shape.y2 = remapY(shape.y2)
            if (shape.type != ShapeType.LINE && shape.type != ShapeType.ARROW) {
                shape.thickness *= ratio
            }
        }

        for (i in undoStack.indices) undoStack[i] = scaleUndoAction(undoStack[i], ratio)
        for (i in redoStack.indices) redoStack[i] = scaleUndoAction(redoStack[i], ratio)
        if (!selectionBounds.isEmpty) {
            selectionBounds.set(
                selectionBounds.left  * ratio, remapY(selectionBounds.top),
                selectionBounds.right * ratio, remapY(selectionBounds.bottom),
            )
        }
    }

    private fun scaleUndoAction(action: UndoAction, ratio: Float): UndoAction {
        val oldPageH = pageHeightPx
        val gap      = PAGE_GAP
        fun remapY(y: Float): Float {
            if (oldPageH + gap <= 0f) return y * ratio
            val pageIdx = (y / (oldPageH + gap)).toInt().coerceAtLeast(0)
            val yInPage = y - pageIdx * (oldPageH + gap)
            return pageIdx * (oldPageH * ratio + gap) + yInPage * ratio
        }
        return when (action) {
            is UndoAction.AddShape      -> action  // shape coords already scaled above
            is UndoAction.AddStroke     -> action  // stroke points already scaled above
            is UndoAction.EraseStrokes  -> action  // stroke points already scaled above
            is UndoAction.MoveStrokes   -> action.copy(dx = action.dx * ratio, dy = action.dy * ratio)
            is UndoAction.ResizeStrokes -> action.copy(pivotX = action.pivotX * ratio, pivotY = action.pivotY * ratio)
            is UndoAction.AddText       -> action  // element reference is mutated in-place above
            is UndoAction.DeleteText    -> action  // removed element; same limitation as EraseStrokes
            is UndoAction.EditText      -> action.copy(
                before = action.before.copy(
                    x = action.before.x * ratio,
                    y = remapY(action.before.y),
                    width = action.before.width * ratio,
                    height = action.before.height * ratio,
                    fontSize = action.before.fontSize * ratio,
                ),
                after = action.after.copy(
                    x = action.after.x * ratio,
                    y = remapY(action.after.y),
                    width = action.after.width * ratio,
                    height = action.after.height * ratio,
                    fontSize = action.after.fontSize * ratio,
                ),
            )
        }
    }

    private fun reLayoutPages(viewWidth: Int, fromScratch: Boolean = false) {
        pageHeightPx = viewWidth * PAGE_ASPECT
        updateMinScale()
        val docH = totalDocHeight().coerceAtLeast(1f).toInt()
        val newBitmap = Bitmap.createBitmap(viewWidth, docH, Bitmap.Config.ARGB_8888)
        val newCanvas = Canvas(newBitmap)
        if (!fromScratch && bitmap != null) {
            bitmap?.let { newCanvas.drawBitmap(it, 0f, 0f, null) }
        } else if (committedStrokes.isNotEmpty() || committedShapes.isNotEmpty()) {
            val clipPath = buildPageClipPath()
            for (stroke in committedStrokes) {
                val path = BezierSmoother.buildPath(stroke.points) ?: continue
                newCanvas.save()
                newCanvas.clipPath(clipPath)
                newCanvas.drawPath(path, paintForStroke(stroke))
                newCanvas.restore()
            }
            for (shape in committedShapes) {
                newCanvas.save()
                newCanvas.clipPath(clipPath)
                drawShape(newCanvas, shape)
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

        // Draw shapes live (above strokes, page-clipped)
        canvas.save()
        canvas.clipPath(buildPageClipPath())
        for (shape in committedShapes) drawShape(canvas, shape)
        activeShape?.let { drawShape(canvas, it) }
        canvas.restore()

        // Draw text elements live (above strokes, page-clipped)
        canvas.save()
        canvas.clipPath(buildPageClipPath())
        for (el in textElements) {
            val boxRect = RectF(el.x, el.y, el.x + el.width, el.y + el.height)
            if (el.id == activeTextId) {
                // Active (being edited): show border+fill only — JS TextInput handles the visible text
                canvas.drawRect(boxRect, textBoxFillPaint)
                canvas.drawRect(boxRect, textBoxBorderPaint)
            } else {
                // Committed: show text, no border/fill
                textPaint.color = el.color
                textPaint.textSize = el.fontSize
                textPaint.typeface = android.graphics.Typeface.create(el.fontFamily, when {
                    el.bold && el.italic -> android.graphics.Typeface.BOLD_ITALIC
                    el.bold -> android.graphics.Typeface.BOLD
                    el.italic -> android.graphics.Typeface.ITALIC
                    else -> android.graphics.Typeface.NORMAL
                })
                val sl = StaticLayout.Builder
                    .obtain(el.text, 0, el.text.length, textPaint, el.width.toInt().coerceAtLeast(1))
                    .setAlignment(Layout.Alignment.ALIGN_NORMAL)
                    .setLineSpacing(0f, 1.2f)
                    .build()
                canvas.save()
                canvas.translate(el.x, el.y)
                sl.draw(canvas)
                canvas.restore()
            }
        }
        // Pending box: drawn but not yet committed as a text element
        pendingBoxRect?.let {
            canvas.drawRect(it, textBoxFillPaint)
            canvas.drawRect(it, textBoxBorderPaint)
        }
        // Rubber-band rect during active drag
        if (isTextDragging && !textDragRect.isEmpty) {
            canvas.drawRect(textDragRect, textBoxFillPaint)
            canvas.drawRect(textDragRect, textBoxBorderPaint)
        }
        canvas.restore()

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

        // 7. Laser pointer (screen space, always on top)
        if (laserPoints.isNotEmpty()) {
            val elapsed = if (laserFadeStart > 0L) android.os.SystemClock.uptimeMillis() - laserFadeStart else 0L
            if (laserFadeStart > 0L && elapsed >= LASER_FADE_MS) {
                laserPoints.clear(); laserFadeStart = 0L
            } else {
                val baseAlpha = if (laserFadeStart == 0L) 255
                                else ((1f - elapsed.toFloat() / LASER_FADE_MS) * 255).toInt().coerceIn(0, 255)
                val n = laserPoints.size
                laserGlowPaint.color = laserColor
                laserCorePaint.color = laserColor
                // Glow: single smooth bezier path
                laserGlowPaint.alpha = (baseAlpha * 0.38f).toInt()
                canvas.drawPath(buildLaserPath(laserPoints), laserGlowPaint)
                // Core: per-segment gradient (historical points make segments tiny → smooth)
                for (i in 1 until n) {
                    val frac = i.toFloat() / n
                    laserCorePaint.alpha = (frac * baseAlpha).toInt()
                    canvas.drawLine(laserPoints[i-1].x, laserPoints[i-1].y,
                                    laserPoints[i].x,   laserPoints[i].y, laserCorePaint)
                }
                // Bright white hot-spot at tip
                laserHotPaint.alpha = (baseAlpha * 0.9f).toInt()
                canvas.drawCircle(laserPoints.last().x, laserPoints.last().y, 5f, laserHotPaint)
                if (laserFadeStart > 0L) postInvalidateOnAnimation()
            }
        }
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
        val isFinger = event.getToolType(0) == MotionEvent.TOOL_TYPE_FINGER
        when {
            // Finger always scrolls — even during text/select tools (stylus-only drawing)
            isFinger || currentTool == ToolType.SCROLL      -> handleScroll(event)
            currentTool == ToolType.LASER                   -> handleLaser(event)
            currentTool == ToolType.TEXT                    -> handleText(event)
            currentTool == ToolType.SELECT                  -> handleSelect(event)
            currentTool == ToolType.SHAPES                  -> handleShape(event)
            else                                            -> handleDraw(event)
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
            for (el in textElements) {
                el.y += shift
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

    // ── Laser tool handling ───────────────────────────────────────────────────

    private fun handleLaser(event: MotionEvent) {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                parent?.requestDisallowInterceptTouchEvent(true)
                laserFadeStart = 0L
                laserPoints.clear()
                laserPoints.add(android.graphics.PointF(event.x, event.y))
                invalidate()
            }
            MotionEvent.ACTION_MOVE -> {
                // Consume all batched sub-frame positions for maximum resolution
                for (h in 0 until event.historySize) {
                    laserPoints.add(android.graphics.PointF(event.getHistoricalX(h), event.getHistoricalY(h)))
                }
                laserPoints.add(android.graphics.PointF(event.x, event.y))
                while (laserPoints.size > 120) laserPoints.removeAt(0)
                invalidate()
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                laserFadeStart = android.os.SystemClock.uptimeMillis()
                invalidate()
            }
        }
    }

    private fun buildLaserPath(pts: List<android.graphics.PointF>): Path {
        val path = Path()
        if (pts.size < 2) return path
        path.moveTo(pts[0].x, pts[0].y)
        if (pts.size == 2) { path.lineTo(pts[1].x, pts[1].y); return path }
        for (i in 1 until pts.size - 1) {
            val midX = (pts[i].x + pts[i + 1].x) / 2f
            val midY = (pts[i].y + pts[i + 1].y) / 2f
            path.quadTo(pts[i].x, pts[i].y, midX, midY)
        }
        path.lineTo(pts.last().x, pts.last().y)
        return path
    }

    // ── Shape tool handling ───────────────────────────────────────────────────

    private fun handleShape(event: MotionEvent) {
        val xDoc = toLogicalX(event.x)
        val yDoc = toLogicalY(event.y)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                parent?.requestDisallowInterceptTouchEvent(true)
                redoStack.clear()
                activeShape = Shape(
                    id        = System.currentTimeMillis().toString(),
                    type      = currentShapeType,
                    x1        = xDoc, y1 = yDoc,
                    x2        = xDoc, y2 = yDoc,
                    color     = shapeColor,
                    thickness = shapeThickness,
                )
                invalidate()
            }
            MotionEvent.ACTION_MOVE -> {
                activeShape?.let { it.x2 = xDoc; it.y2 = yDoc }
                invalidate()
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                activeShape?.let { shape ->
                    shape.x2 = xDoc; shape.y2 = yDoc
                    // Only commit if the drag was meaningful
                    val dx = shape.x2 - shape.x1; val dy = shape.y2 - shape.y1
                    if (dx * dx + dy * dy > 4f) {
                        committedShapes.add(shape)
                        undoStack.add(UndoAction.AddShape(shape))
                        // Draw onto the bitmap cache
                        bitmapCanvas?.save()
                        bitmapCanvas?.clipPath(buildPageClipPath())
                        drawShape(bitmapCanvas!!, shape)
                        bitmapCanvas?.restore()
                        notifyUndoRedoState()
                    }
                    activeShape = null
                    invalidate()
                }
            }
        }
    }

    private fun drawShape(canvas: Canvas, shape: Shape) {
        shapePaint.color = shape.color
        shapePaint.strokeWidth = shape.thickness
        val x1 = shape.x1; val y1 = shape.y1; val x2 = shape.x2; val y2 = shape.y2
        when (shape.type) {
            ShapeType.LINE -> {
                canvas.drawLine(x1, y1, x2, y2, shapePaint)
            }
            ShapeType.RECTANGLE -> {
                val left = minOf(x1, x2); val top = minOf(y1, y2)
                val right = maxOf(x1, x2); val bottom = maxOf(y1, y2)
                canvas.drawRect(left, top, right, bottom, shapePaint)
            }
            ShapeType.OVAL -> {
                val left = minOf(x1, x2); val top = minOf(y1, y2)
                val right = maxOf(x1, x2); val bottom = maxOf(y1, y2)
                canvas.drawOval(RectF(left, top, right, bottom), shapePaint)
            }
            ShapeType.ARROW -> {
                canvas.drawLine(x1, y1, x2, y2, shapePaint)
                // Draw arrowhead at (x2, y2)
                val angle = atan2((y2 - y1).toDouble(), (x2 - x1).toDouble())
                val arrowLen = (shape.thickness * 4f).coerceIn(10f, 30f)
                val arrowAngle = Math.PI / 6  // 30 degrees
                val ax1 = (x2 - arrowLen * cos(angle - arrowAngle)).toFloat()
                val ay1 = (y2 - arrowLen * sin(angle - arrowAngle)).toFloat()
                val ax2 = (x2 - arrowLen * cos(angle + arrowAngle)).toFloat()
                val ay2 = (y2 - arrowLen * sin(angle + arrowAngle)).toFloat()
                shapeArrowFillPaint.color = shape.color
                val arrowPath = Path()
                arrowPath.moveTo(x2, y2)
                arrowPath.lineTo(ax1, ay1)
                arrowPath.lineTo(ax2, ay2)
                arrowPath.close()
                canvas.drawPath(arrowPath, shapeArrowFillPaint)
            }
        }
    }

    // ── Text tool handling ────────────────────────────────────────────────────

    private fun handleText(event: MotionEvent) {
        val xDoc = toLogicalX(event.x)
        val yDoc = toLogicalY(event.y)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                val hit = hitTestTextElement(xDoc, yDoc)
                if (hit != null) {
                    activeTextId = hit.id
                    pendingBoxRect = null
                    invalidate()
                    onTextEditTap?.invoke(hit,
                        hit.x * scale + translateX, hit.y * scale - scrollY,
                        hit.width * scale, hit.height * scale)
                } else {
                    parent?.requestDisallowInterceptTouchEvent(true)
                    textDragStartX = xDoc; textDragStartY = yDoc
                    textDragRect.set(xDoc, yDoc, xDoc, yDoc)
                    isTextDragging = true
                }
            }
            MotionEvent.ACTION_MOVE -> {
                if (!isTextDragging) return
                textDragRect.set(
                    minOf(textDragStartX, xDoc), minOf(textDragStartY, yDoc),
                    maxOf(textDragStartX, xDoc), maxOf(textDragStartY, yDoc),
                )
                invalidate()
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                if (!isTextDragging) return
                isTextDragging = false
                val w = textDragRect.width(); val h = textDragRect.height()
                if (w > 20f && h > 20f) {
                    activeTextId = null
                    pendingBoxRect = RectF(textDragRect)
                    onTextTap?.invoke(textDragRect.left, textDragRect.top, w, h,
                        textDragRect.left * scale + translateX, textDragRect.top * scale - scrollY,
                        w * scale, h * scale)
                }
                textDragRect.setEmpty()
                invalidate()
            }
        }
    }

    private fun hitTestTextElement(x: Float, y: Float): TextElement? {
        for (el in textElements.reversed()) {
            val bounds = RectF(el.x, el.y, el.x + el.width, el.y + el.height)
            if (bounds.contains(x, y)) return el
        }
        return null
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

    fun setActiveText(id: String) {
        activeTextId = if (id.isEmpty()) null else id
        invalidate()
    }

    fun clearPendingBox() {
        pendingBoxRect = null
        invalidate()
    }

    fun addTextElement(id: String, text: String, x: Float, y: Float, width: Float, height: Float, fontSize: Float, color: Int, bold: Boolean, italic: Boolean, fontFamily: String) {
        pendingBoxRect = null   // pending box is now realized as an element
        val el = TextElement(id, text, x, y, width, height, fontSize, color, bold, italic, fontFamily)
        textElements.add(el)
        undoStack.add(UndoAction.AddText(el))
        redoStack.clear()
        notifyUndoRedoState()
        invalidate()
    }

    fun updateTextElement(id: String, text: String, fontSize: Float, color: Int, bold: Boolean, italic: Boolean, fontFamily: String) {
        val el = textElements.find { it.id == id } ?: return
        val before = el.copy()
        el.text = text; el.fontSize = fontSize; el.color = color
        el.bold = bold; el.italic = italic; el.fontFamily = fontFamily
        undoStack.add(UndoAction.EditText(id, before, el.copy()))
        redoStack.clear()
        if (activeTextId == id) activeTextId = null   // auto-clear active state
        notifyUndoRedoState()
        invalidate()
    }

    fun deleteTextElement(id: String) {
        if (activeTextId == id) activeTextId = null
        val el = textElements.find { it.id == id } ?: return
        textElements.remove(el)
        undoStack.add(UndoAction.DeleteText(el))
        redoStack.clear()
        notifyUndoRedoState()
        invalidate()
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
            is UndoAction.AddShape  -> committedShapes.remove(action.shape)
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
            is UndoAction.AddText -> textElements.remove(action.element)
            is UndoAction.DeleteText -> textElements.add(action.element)
            is UndoAction.EditText -> {
                val el = textElements.find { it.id == action.id } ?: return
                el.text = action.before.text; el.fontSize = action.before.fontSize
                el.width = action.before.width; el.height = action.before.height
                el.color = action.before.color; el.bold = action.before.bold
                el.italic = action.before.italic; el.fontFamily = action.before.fontFamily
            }
        }
        redrawBitmap()
        redoStack.add(action)
        notifyUndoRedoState()
    }

    fun redo() {
        val action = redoStack.removeLastOrNull() ?: return
        when (action) {
            is UndoAction.AddShape -> {
                committedShapes.add(action.shape)
                redrawBitmap()
                invalidate()
            }
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
            is UndoAction.AddText -> textElements.add(action.element)
            is UndoAction.DeleteText -> textElements.remove(action.element)
            is UndoAction.EditText -> {
                val el = textElements.find { it.id == action.id } ?: return
                el.text = action.after.text; el.fontSize = action.after.fontSize
                el.width = action.after.width; el.height = action.after.height
                el.color = action.after.color; el.bold = action.after.bold
                el.italic = action.after.italic; el.fontFamily = action.after.fontFamily
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
        for (shape in committedShapes) {
            newCanvas.save()
            newCanvas.clipPath(clipPath)
            drawShape(newCanvas, shape)
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
        committedShapes.clear()
        undoStack.clear()
        redoStack.clear()
        textElements.clear()
        activeTextId = null
        pendingBoxRect = null
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
        val textArr = JSONArray()
        for (el in textElements) {
            textArr.put(JSONObject().apply {
                put("id", el.id)
                put("text", el.text)
                put("x", el.x.toDouble())
                put("y", el.y.toDouble())
                put("width", el.width.toDouble())
                put("height", el.height.toDouble())
                put("fontSize", el.fontSize.toDouble())
                put("color", el.color)
                put("bold", el.bold)
                put("italic", el.italic)
                put("fontFamily", el.fontFamily)
            })
        }
        obj.put("textElements", textArr)
        val shapesArr = JSONArray()
        for (shape in committedShapes) {
            shapesArr.put(JSONObject().apply {
                put("id", shape.id)
                put("type", shape.type.name)
                put("x1", shape.x1.toDouble()); put("y1", shape.y1.toDouble())
                put("x2", shape.x2.toDouble()); put("y2", shape.y2.toDouble())
                put("color", shape.color)
                put("thickness", shape.thickness.toDouble())
            })
        }
        obj.put("shapes", shapesArr)
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
        committedShapes.clear()
        undoStack.clear()
        redoStack.clear()
        textElements.clear()
        clearSelection()

        val arr: JSONArray
        if (json.trimStart().startsWith('{')) {
            // v2 format: { "version": 2, "pageCount": N, "strokes": [...] }
            val obj = JSONObject(json)
            pageCount = obj.optInt("pageCount", 1).coerceAtLeast(1)
            arr = obj.optJSONArray("strokes") ?: JSONArray()
            val tArr = obj.optJSONArray("textElements") ?: JSONArray()
            for (i in 0 until tArr.length()) {
                val t = tArr.getJSONObject(i)
                textElements.add(TextElement(
                    id         = t.optString("id", System.currentTimeMillis().toString()),
                    text       = t.optString("text", ""),
                    x          = t.getDouble("x").toFloat(),
                    y          = t.getDouble("y").toFloat(),
                    width      = t.optDouble("width", 200.0).toFloat(),
                    height     = t.optDouble("height", 100.0).toFloat(),
                    fontSize   = t.getDouble("fontSize").toFloat(),
                    color      = t.getInt("color"),
                    bold       = t.optBoolean("bold", false),
                    italic     = t.optBoolean("italic", false),
                    fontFamily = t.optString("fontFamily", "sans-serif"),
                ))
            }
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

        // Load shapes (v2+ only)
        if (json.trimStart().startsWith('{')) {
            val obj2 = JSONObject(json)
            val sArr = obj2.optJSONArray("shapes") ?: JSONArray()
            for (i in 0 until sArr.length()) {
                val s = sArr.getJSONObject(i)
                val shapeType = try { ShapeType.valueOf(s.getString("type")) } catch (e: Exception) { ShapeType.LINE }
                committedShapes.add(Shape(
                    id        = s.optString("id", System.currentTimeMillis().toString()),
                    type      = shapeType,
                    x1        = s.getDouble("x1").toFloat(),
                    y1        = s.getDouble("y1").toFloat(),
                    x2        = s.getDouble("x2").toFloat(),
                    y2        = s.getDouble("y2").toFloat(),
                    color     = s.getInt("color"),
                    thickness = s.getDouble("thickness").toFloat(),
                ))
            }
        }

        lastEmittedPage = -1
        onPageCountChanged?.invoke(pageCount)
        // Recreate bitmap at new doc height (pageHeightPx already set via onSizeChanged)
        redrawBitmap()
        notifyUndoRedoState()
    }
}
