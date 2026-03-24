package com.tabletnoteapp.canvas

import android.content.Context
import android.graphics.*
import android.graphics.pdf.PdfRenderer
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.os.ParcelFileDescriptor
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
import java.io.File
import java.util.concurrent.Executors
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

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
    private var logicalWidth  = 0                        // view width at which current stroke coordinates were recorded

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

    private var minScale = 0.85f

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
    private val textElements       = mutableListOf<TextElement>()
    private val textPaint          = TextPaint(Paint.ANTI_ALIAS_FLAG)
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
    private val textDragRect = RectF()
    private var isTextDragging = false

    // Active / pending text box state
    private var activeTextId: String? = null
    private var pendingBoxRect: RectF? = null
    private var activeStroke: Stroke? = null
    private val strokeEraserBuffer = mutableListOf<Pair<Int, Stroke>>()
    private var strokeOriginalIndexMap: Map<Stroke, Int> = emptyMap()

    var currentTool:        ToolType = ToolType.SCROLL
        set(value) {
            if (field == ToolType.SELECT && value != ToolType.SELECT) clearSelection()
            field = value
        }
    var penColor:           Int      = Color.BLACK
    var penThickness:       Float    = 4f
    var eraserThickness:    Float    = 24f
    var eraserMode:         String   = "pixel"   // "pixel" | "stroke"
    var highlighterColor:   Int      = Color.YELLOW
    var highlighterThickness: Float  = 16f

    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
    }
    private val highlighterPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
        alpha = 120  // ~47% opacity — like a real highlighter
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

    var laserColor: Int = Color.RED
    private val laserPoints = mutableListOf<android.graphics.PointF>()
    private val laserGlowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.BUTT; strokeJoin = Paint.Join.ROUND
        strokeWidth = 22f
        maskFilter = BlurMaskFilter(14f, BlurMaskFilter.Blur.NORMAL)
    }
    private val laserCorePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.BUTT; strokeJoin = Paint.Join.ROUND
        strokeWidth = 3.5f
    }
    private val laserHotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = Color.WHITE
    }
    private var laserFadeStart = 0L
    private val LASER_FADE_MS  = 600L

    // ── Shape state ───────────────────────────────────────────────────────────

    var currentShapeType: ShapeType = ShapeType.LINE
    var shapeColor: Int = Color.BLACK
    var shapeThickness: Float = 4f
    private val committedShapes = mutableListOf<Shape>()
    private var activeShape: Shape? = null

    private val shapePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
    }
    private val shapeArrowFillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }

    private val pageBgPaint = Paint().apply { color = Color.WHITE }

    // ── Selection state ───────────────────────────────────────────────────────

    private enum class SelectState { IDLE, DRAWING, SELECTED, MOVING, RESIZING }
    private var selectState       = SelectState.IDLE
    private val selectionDragRect = RectF()
    private val selectedIndices   = mutableSetOf<Int>()
    private val selectionBounds   = RectF()
    private var moveStartX = 0f
    private var moveStartY = 0f
    private var resizeHandleIndex = -1
    private val HANDLE_RADIUS    = 28f
    private val SELECTION_PADDING = 12f

    private val selectionDragPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = 2f
        color = Color.argb(200, 30, 120, 255)
        pathEffect = android.graphics.DashPathEffect(floatArrayOf(12f, 8f), 0f)
    }
    private val selectionBoundsPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = 2f
        color = Color.argb(220, 30, 120, 255)
        pathEffect = android.graphics.DashPathEffect(floatArrayOf(12f, 8f), 0f)
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
    var onEraserLift: (() -> Unit)? = null
    var onSelectionChanged:    ((hasSelection: Boolean, count: Int, bounds: RectF) -> Unit)? = null
    var onTextTap: ((docX: Float, docY: Float, width: Float, height: Float) -> Unit)? = null
    var onTextEditTap: ((TextElement) -> Unit)? = null
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
                    logicalWidth = vw  // record the width strokes will be drawn at
                    val firstH = pageHeights.firstOrNull() ?: 0
                    if (firstH > 0 && height > 0) {
                        minScale = (height.toFloat() / firstH * 0.95f).coerceIn(0.1f, 1f)
                    }
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
        val ratio = if (logicalWidth > 0) vw.toFloat() / logicalWidth else 1f

        // Capture which logical Y was at screen centre (old coords).
        val logCenterYOld = if (scale > 0f) (scrollY + height / 2f) / scale else 0f

        // Save old page Y offsets before rebuilding the layout.
        val oldOffsets = pageYOffsets.toList()

        // Recompute page layout (bitmaps are reused as-is; scaled in onDraw).
        val gap = pageGapPx
        pageHeights.clear(); pageYOffsets.clear()
        var y = 0f
        for (aspect in pageAspects) {
            val h = (vw * aspect).toInt()
            pageHeights.add(h); pageYOffsets.add(y); y += h + gap
        }
        totalDocHeight = y
        val newOffsets = pageYOffsets.toList()

        // Page-aware Y remapping: keeps stroke positions relative to their page top.
        // Simple `y * ratio` accumulates error across pages because inter-page gaps
        // are fixed physical dp and do NOT scale with the page width ratio.
        fun remapY(oldY: Float): Float {
            if (ratio == 1f || oldOffsets.isEmpty()) return oldY
            val pageIdx = oldOffsets.indexOfLast { it <= oldY }.coerceAtLeast(0)
            val yInPage = oldY - oldOffsets[pageIdx]
            return (newOffsets.getOrNull(pageIdx) ?: oldOffsets[pageIdx] * ratio) + yInPage * ratio
        }

        // Rescale stroke coordinates to the new view width.
        if (ratio != 1f) {
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
            for (shape in committedShapes) {
                shape.x1 *= ratio; shape.y1 = remapY(shape.y1)
                shape.x2 *= ratio; shape.y2 = remapY(shape.y2)
                shape.thickness *= ratio
            }
        }
        logicalWidth = vw

        val firstH = pageHeights.firstOrNull() ?: 0
        if (firstH > 0 && height > 0) {
            minScale = (height.toFloat() / firstH * 0.95f).coerceIn(0.1f, 1f)
        }

        // Clamp scale first (portrait minScale can be larger than the zoomed-out scale).
        scale = scale.coerceIn(minScale, 4f)

        // Restore scroll so the same content stays at screen centre.
        scrollY = (remapY(logCenterYOld) * scale - height / 2f).coerceIn(0f, maxScrollY())

        constrain()
        notifyUndoRedoState()
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

        // 2. Annotation strokes — clipped to page boundaries so strokes don't bleed into gaps
        canvas.save()
        val clipPath = Path()
        for (i in pageYOffsets.indices) {
            val ph = pageHeights.getOrNull(i) ?: continue
            clipPath.addRect(0f, pageYOffsets[i], width.toFloat(), pageYOffsets[i] + ph, Path.Direction.CW)
        }
        canvas.clipPath(clipPath)

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
        canvas.restore()  // remove page clip

        // Draw shapes (above strokes, page-clipped)
        canvas.save()
        val shapeClipPath = Path()
        for (i in pageYOffsets.indices) {
            val ph = pageHeights.getOrNull(i) ?: continue
            shapeClipPath.addRect(0f, pageYOffsets[i], width.toFloat(), pageYOffsets[i] + ph, Path.Direction.CW)
        }
        canvas.clipPath(shapeClipPath)
        for (shape in committedShapes) drawShape(canvas, shape)
        activeShape?.let { drawShape(canvas, it) }
        canvas.restore()

        // Text elements (live, page-clipped, above strokes)
        canvas.save()
        val textClipPath = Path()
        for (i in pageYOffsets.indices) {
            val ph = pageHeights.getOrNull(i) ?: continue
            textClipPath.addRect(0f, pageYOffsets[i], width.toFloat(), pageYOffsets[i] + ph, Path.Direction.CW)
        }
        canvas.clipPath(textClipPath)
        for (el in textElements) {
            val boxRect = RectF(el.x, el.y, el.x + el.width, el.y + el.height)
            if (el.id == activeTextId) {
                canvas.drawRect(boxRect, textBoxFillPaint)
                canvas.drawRect(boxRect, textBoxBorderPaint)
            } else {
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
        pendingBoxRect?.let {
            canvas.drawRect(it, textBoxFillPaint)
            canvas.drawRect(it, textBoxBorderPaint)
        }
        if (isTextDragging && !textDragRect.isEmpty) {
            canvas.drawRect(textDragRect, textBoxFillPaint)
            canvas.drawRect(textDragRect, textBoxBorderPaint)
        }
        canvas.restore()

        // 3. Selection overlays (logical space, no page clip so handles are always visible)
        when (selectState) {
            SelectState.DRAWING -> {
                canvas.drawRect(selectionDragRect, selectionFillPaint)
                canvas.drawRect(selectionDragRect, selectionDragPaint)
            }
            SelectState.SELECTED, SelectState.MOVING, SelectState.RESIZING -> {
                for (idx in selectedIndices) {
                    val stroke = committedStrokes.getOrNull(idx) ?: continue
                    BezierSmoother.buildPath(stroke.points)?.let {
                        selectedStrokeOverlayPaint.strokeWidth = stroke.style.thickness + 4f
                        canvas.drawPath(it, selectedStrokeOverlayPaint)
                    }
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

        canvas.restore()  // remove translate + scale

        // 3. Scrollbar (screen coords, outside transform)
        drawScrollbar(canvas)

        // 4. Eraser cursor (screen coords, outside transform)
        if (showEraserCursor) {
            val r = eraserThickness / 2f
            canvas.drawCircle(eraserCursorX, eraserCursorY, r, strokeEraserFillPaint)
            canvas.drawCircle(eraserCursorX, eraserCursorY, r, strokeEraserBorderPaint)
        }

        // 5. Laser pointer (screen space, always on top)
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
                laserHotPaint.alpha = (baseAlpha * 0.9f).toInt()
                canvas.drawCircle(laserPoints.last().x, laserPoints.last().y, 5f, laserHotPaint)
                if (laserFadeStart > 0L) postInvalidateOnAnimation()
            }
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

        val isFinger = event.getToolType(0) == MotionEvent.TOOL_TYPE_FINGER
        // Finger always scrolls — stylus-only for drawing/text
        if (isFinger || currentTool == ToolType.SCROLL || currentTool == ToolType.SELECT) return handleScroll(event)
        if (currentTool == ToolType.LASER) return handleLaser(event)
        if (currentTool == ToolType.TEXT) return handleText(event)
        if (currentTool == ToolType.SHAPES) return handleShape(event)

        // Stylus in draw mode
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
                    notifyUndoRedoState()
                    onEraserLift?.invoke()
                    invalidate()
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
                val (strokeColor, strokeThickness) = when (currentTool) {
                    ToolType.ERASER      -> Color.TRANSPARENT to eraserThickness / scale
                    ToolType.HIGHLIGHTER -> highlighterColor  to highlighterThickness
                    else                 -> penColor          to penThickness
                }
                val style = StrokeStyle(
                    color     = strokeColor,
                    thickness = strokeThickness,
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
                    activeStroke = null
                    notifyUndoRedoState()
                    if (currentTool == ToolType.ERASER) onEraserLift?.invoke()
                }
                invalidate()
            }
        }
        return true
    }

    // ── Laser tool handling ───────────────────────────────────────────────────

    private fun handleLaser(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                parent?.requestDisallowInterceptTouchEvent(true)
                laserFadeStart = 0L
                laserPoints.clear()
                laserPoints.add(android.graphics.PointF(event.x, event.y))
                invalidate()
            }
            MotionEvent.ACTION_MOVE -> {
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
        return true
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

    private fun handleShape(event: MotionEvent): Boolean {
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
                    val dx = shape.x2 - shape.x1; val dy = shape.y2 - shape.y1
                    if (dx * dx + dy * dy > 4f) {
                        committedShapes.add(shape)
                        undoStack.add(UndoAction.AddShape(shape))
                        notifyUndoRedoState()
                    }
                    activeShape = null
                    invalidate()
                }
            }
        }
        return true
    }

    private fun drawShape(canvas: Canvas, shape: Shape) {
        shapePaint.color = shape.color
        shapePaint.strokeWidth = shape.thickness
        val x1 = shape.x1; val y1 = shape.y1; val x2 = shape.x2; val y2 = shape.y2
        when (shape.type) {
            ShapeType.LINE -> canvas.drawLine(x1, y1, x2, y2, shapePaint)
            ShapeType.RECTANGLE -> {
                val left = minOf(x1, x2); val top = minOf(y1, y2)
                canvas.drawRect(left, top, maxOf(x1, x2), maxOf(y1, y2), shapePaint)
            }
            ShapeType.OVAL -> {
                val left = minOf(x1, x2); val top = minOf(y1, y2)
                canvas.drawOval(RectF(left, top, maxOf(x1, x2), maxOf(y1, y2)), shapePaint)
            }
            ShapeType.ARROW -> {
                canvas.drawLine(x1, y1, x2, y2, shapePaint)
                val angle = atan2((y2 - y1).toDouble(), (x2 - x1).toDouble())
                val arrowLen = (shape.thickness * 4f).coerceIn(10f, 30f)
                val arrowAngle = Math.PI / 6
                val ax1 = (x2 - arrowLen * cos(angle - arrowAngle)).toFloat()
                val ay1 = (y2 - arrowLen * sin(angle - arrowAngle)).toFloat()
                val ax2 = (x2 - arrowLen * cos(angle + arrowAngle)).toFloat()
                val ay2 = (y2 - arrowLen * sin(angle + arrowAngle)).toFloat()
                shapeArrowFillPaint.color = shape.color
                val arrowPath = Path()
                arrowPath.moveTo(x2, y2); arrowPath.lineTo(ax1, ay1)
                arrowPath.lineTo(ax2, ay2); arrowPath.close()
                canvas.drawPath(arrowPath, shapeArrowFillPaint)
            }
        }
    }

    // ── Text tool handling ────────────────────────────────────────────────────

    private fun handleText(event: MotionEvent): Boolean {
        val xDoc = toLogicalX(event.x)
        val yDoc = toLogicalY(event.y)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                val hit = hitTestTextElement(xDoc, yDoc)
                if (hit != null) {
                    activeTextId = hit.id
                    pendingBoxRect = null
                    invalidate()
                    onTextEditTap?.invoke(hit)
                } else {
                    parent?.requestDisallowInterceptTouchEvent(true)
                    textDragStartX = xDoc; textDragStartY = yDoc
                    textDragRect.set(xDoc, yDoc, xDoc, yDoc)
                    isTextDragging = true
                }
            }
            MotionEvent.ACTION_MOVE -> {
                if (!isTextDragging) return true
                textDragRect.set(
                    minOf(textDragStartX, xDoc), minOf(textDragStartY, yDoc),
                    maxOf(textDragStartX, xDoc), maxOf(textDragStartY, yDoc),
                )
                invalidate()
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                if (!isTextDragging) return true
                isTextDragging = false
                val w = textDragRect.width(); val h = textDragRect.height()
                if (w > 20f && h > 20f) {
                    activeTextId = null
                    pendingBoxRect = RectF(textDragRect)
                    onTextTap?.invoke(textDragRect.left, textDragRect.top, w, h)
                }
                textDragRect.setEmpty()
                invalidate()
            }
        }
        return true
    }

    private fun hitTestTextElement(x: Float, y: Float): TextElement? {
        for (el in textElements.reversed()) {
            val bounds = RectF(el.x, el.y, el.x + el.width, el.y + el.height)
            if (bounds.contains(x, y)) return el
        }
        return null
    }

    // ── Selection ─────────────────────────────────────────────────────────────

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
                        for (idx in selectedIndices) {
                            val stroke = committedStrokes.getOrNull(idx) ?: continue
                            for (i in stroke.points.indices) {
                                val p = stroke.points[i]
                                stroke.points[i] = p.copy(x = p.x + dx, y = p.y + dy)
                            }
                        }
                        updateSelectionBounds()
                        invalidate()
                    }
                    SelectState.RESIZING -> {
                        val dx = xDoc - moveStartX; val dy = yDoc - moveStartY
                        moveStartX = xDoc; moveStartY = yDoc
                        val pivotX = if (resizeHandleIndex == 0 || resizeHandleIndex == 3) selectionBounds.right else selectionBounds.left
                        val pivotY = if (resizeHandleIndex == 0 || resizeHandleIndex == 1) selectionBounds.bottom else selectionBounds.top
                        val w = selectionBounds.width().takeIf { it > 0f } ?: return
                        val h = selectionBounds.height().takeIf { it > 0f } ?: return
                        val sx = (1f + dx / w).coerceIn(0.1f, 10f)
                        val sy = (1f + dy / h).coerceIn(0.1f, 10f)
                        for (idx in selectedIndices) {
                            val stroke = committedStrokes.getOrNull(idx) ?: continue
                            for (i in stroke.points.indices) {
                                val p = stroke.points[i]
                                stroke.points[i] = p.copy(
                                    x = pivotX + (p.x - pivotX) * sx,
                                    y = pivotY + (p.y - pivotY) * sy,
                                )
                            }
                        }
                        updateSelectionBounds()
                        invalidate()
                    }
                    else -> {}
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                when (selectState) {
                    SelectState.DRAWING -> {
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
                    SelectState.MOVING, SelectState.RESIZING -> {
                        selectState = SelectState.SELECTED
                        emitSelectionChanged()
                    }
                    else -> {}
                }
                invalidate()
            }
        }
    }

    private fun computeSelection() {
        selectedIndices.clear()
        for ((i, stroke) in committedStrokes.withIndex()) {
            if (stroke.points.any { p -> selectionDragRect.contains(p.x, p.y) }) selectedIndices.add(i)
        }
        if (selectedIndices.isNotEmpty()) updateSelectionBounds()
    }

    private fun updateSelectionBounds() {
        var minX = Float.MAX_VALUE; var minY = Float.MAX_VALUE
        var maxX = Float.MIN_VALUE; var maxY = Float.MIN_VALUE
        for (idx in selectedIndices) {
            for (p in (committedStrokes.getOrNull(idx) ?: continue).points) {
                if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y
                if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y
            }
        }
        if (minX == Float.MAX_VALUE) { selectionBounds.setEmpty(); return }
        selectionBounds.set(minX - SELECTION_PADDING, minY - SELECTION_PADDING,
                            maxX + SELECTION_PADDING, maxY + SELECTION_PADDING)
    }

    private fun hitTestHandle(x: Float, y: Float): Int {
        val corners = listOf(
            selectionBounds.left  to selectionBounds.top,
            selectionBounds.right to selectionBounds.top,
            selectionBounds.right to selectionBounds.bottom,
            selectionBounds.left  to selectionBounds.bottom,
        )
        val hitRadius = HANDLE_RADIUS * 2.5f
        for ((i, c) in corners.withIndex()) {
            val dx = x - c.first; val dy = y - c.second
            if (dx * dx + dy * dy <= hitRadius * hitRadius) return i
        }
        return -1
    }

    private fun clearSelection() {
        selectedIndices.clear(); selectionBounds.setEmpty()
        selectState = SelectState.IDLE
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
        redoStack.clear(); clearSelection(); notifyUndoRedoState(); invalidate()
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
        pendingBoxRect = null
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
        if (activeTextId == id) activeTextId = null
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

    private fun drawHandle(canvas: Canvas, x: Float, y: Float) {
        canvas.drawCircle(x, y, HANDLE_RADIUS, handleFillPaint)
        canvas.drawCircle(x, y, HANDLE_RADIUS, handleBorderPaint)
    }

    private fun eraseStrokesAtPoint(xDoc: Float, yDoc: Float) {
        val t = eraserThickness / (2f * scale)
        val thresholdSq = t * t
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
            is UndoAction.AddShape  -> committedShapes.remove(action.shape)
            is UndoAction.AddStroke -> committedStrokes.remove(action.stroke)
            is UndoAction.EraseStrokes -> {
                for ((idx, stroke) in action.entries.sortedByDescending { it.first }) {
                    committedStrokes.add(idx.coerceIn(0, committedStrokes.size), stroke)
                }
            }
            is UndoAction.MoveStrokes, is UndoAction.ResizeStrokes -> { /* not used in PDF view */ }
            is UndoAction.AddText -> { textElements.remove(action.element) }
            is UndoAction.DeleteText -> { textElements.add(action.element) }
            is UndoAction.EditText -> {
                val el = textElements.find { it.id == action.id } ?: return
                el.text = action.before.text; el.fontSize = action.before.fontSize
                el.width = action.before.width; el.height = action.before.height
                el.color = action.before.color; el.bold = action.before.bold
                el.italic = action.before.italic; el.fontFamily = action.before.fontFamily
            }
        }
        redoStack.add(action)
        notifyUndoRedoState(); invalidate()
    }

    fun redo() {
        val action = redoStack.removeLastOrNull() ?: return
        when (action) {
            is UndoAction.AddShape     -> committedShapes.add(action.shape)
            is UndoAction.AddStroke    -> committedStrokes.add(action.stroke)
            is UndoAction.EraseStrokes -> committedStrokes.removeAll(action.entries.map { it.second }.toSet())
            is UndoAction.MoveStrokes, is UndoAction.ResizeStrokes -> { /* not used in PDF view */ }
            is UndoAction.AddText -> { textElements.add(action.element) }
            is UndoAction.DeleteText -> { textElements.remove(action.element) }
            is UndoAction.EditText -> {
                val el = textElements.find { it.id == action.id } ?: return
                el.text = action.after.text; el.fontSize = action.after.fontSize
                el.width = action.after.width; el.height = action.after.height
                el.color = action.after.color; el.bold = action.after.bold
                el.italic = action.after.italic; el.fontFamily = action.after.fontFamily
            }
        }
        undoStack.add(action)
        notifyUndoRedoState(); invalidate()
    }

    fun clearCanvas() {
        committedStrokes.clear(); committedShapes.clear()
        undoStack.clear(); redoStack.clear()
        textElements.clear()
        activeTextId = null; pendingBoxRect = null
        notifyUndoRedoState(); invalidate()
    }

    // ── Serialization (logical document coordinates) ──────────────────────────

    fun getStrokesJson(): String {
        val obj = JSONObject()
        obj.put("version", 2)
        val arr = JSONArray()
        for (s in committedStrokes) {
            val sObj = JSONObject()
            sObj.put("tool", s.style.tool.name)
            sObj.put("color", s.style.color)
            sObj.put("thickness", s.style.thickness.toDouble())
            val pts = JSONArray()
            for (p in s.points) pts.put(JSONObject().apply {
                put("x", p.x.toDouble()); put("y", p.y.toDouble()); put("pressure", p.pressure.toDouble())
            })
            sObj.put("points", pts); arr.put(sObj)
        }
        obj.put("strokes", arr)
        val textArr = JSONArray()
        for (el in textElements) {
            textArr.put(JSONObject().apply {
                put("id", el.id); put("text", el.text)
                put("x", el.x.toDouble()); put("y", el.y.toDouble())
                put("width", el.width.toDouble()); put("height", el.height.toDouble())
                put("fontSize", el.fontSize.toDouble()); put("color", el.color)
                put("bold", el.bold); put("italic", el.italic); put("fontFamily", el.fontFamily)
            })
        }
        obj.put("textElements", textArr)
        val shapesArr = JSONArray()
        for (shape in committedShapes) {
            shapesArr.put(JSONObject().apply {
                put("id", shape.id); put("type", shape.type.name)
                put("x1", shape.x1.toDouble()); put("y1", shape.y1.toDouble())
                put("x2", shape.x2.toDouble()); put("y2", shape.y2.toDouble())
                put("color", shape.color); put("thickness", shape.thickness.toDouble())
            })
        }
        obj.put("shapes", shapesArr)
        return obj.toString()
    }

    fun loadStrokesJson(json: String) {
        committedStrokes.clear(); committedShapes.clear()
        undoStack.clear(); redoStack.clear()
        textElements.clear()
        val arr: JSONArray
        if (json.trimStart().startsWith('{')) {
            val obj = JSONObject(json)
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
            arr = JSONArray(json)
        }
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
        // Load shapes (v2+ only)
        if (json.trimStart().startsWith('{')) {
            val obj2 = JSONObject(json)
            val sArr = obj2.optJSONArray("shapes") ?: JSONArray()
            for (i in 0 until sArr.length()) {
                val s = sArr.getJSONObject(i)
                val shapeType = try { ShapeType.valueOf(s.getString("type")) } catch (_: Exception) { ShapeType.LINE }
                committedShapes.add(Shape(
                    id        = s.optString("id", System.currentTimeMillis().toString()),
                    type      = shapeType,
                    x1        = s.getDouble("x1").toFloat(), y1 = s.getDouble("y1").toFloat(),
                    x2        = s.getDouble("x2").toFloat(), y2 = s.getDouble("y2").toFloat(),
                    color     = s.getInt("color"),
                    thickness = s.getDouble("thickness").toFloat(),
                ))
            }
        }
        notifyUndoRedoState(); invalidate()
    }

    // ── Commands ──────────────────────────────────────────────────────────────

    fun applyScale(s: Float) {
        scale = s; constrain(); invalidate()
    }

    fun scrollToPage(page: Int) {
        if (pageYOffsets.isEmpty()) return
        val idx = (page - 1).coerceIn(0, pageYOffsets.size - 1)
        scrollY = (pageYOffsets[idx] * scale).coerceIn(0f, maxScrollY())
        notifyPageChanged(); invalidate()
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun paintForStroke(s: Stroke) = when (s.style.tool) {
        ToolType.ERASER      -> eraserPaint.also { it.strokeWidth = s.style.thickness }
        ToolType.HIGHLIGHTER -> highlighterPaint.also {
            it.color = s.style.color; it.alpha = 120; it.strokeWidth = s.style.thickness
        }
        else -> strokePaint.also { it.color = s.style.color; it.strokeWidth = s.style.thickness }
    }

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
