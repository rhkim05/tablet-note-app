package com.tabletnoteapp.canvas

import android.content.Context
import android.graphics.*
import android.view.MotionEvent
import android.view.View

/**
 * Native HSV colour picker.
 * The thumb is updated immediately from touch — no JS bridge round-trip involved.
 * JS is notified asynchronously via callbacks for the colour preview / pen colour.
 */
class ColorGradientView(context: Context) : View(context) {

    // ── Internal state (source of truth for rendering) ────────────────────────
    // Updated directly on touch for zero-latency redraws.
    // Also updated by ViewManager prop setters (preset selection, initial load).

    private var _hue = 0f
    private var _sat = 1f
    private var _bri = 1f
    private var isUserTouching = false

    fun setHueProp(h: Float) { if (!isUserTouching) { _hue = h.coerceIn(0f, 360f); buildGradients(); invalidate() } }
    fun setSatProp(s: Float) { if (!isUserTouching) { _sat = s.coerceIn(0f, 1f) } }
    fun setBriProp(b: Float) { if (!isUserTouching) { _bri = b.coerceIn(0f, 1f) } }

    // ── Callbacks (async JS notification) ─────────────────────────────────────

    var onSVChange:  ((Float, Float) -> Unit)? = null
    var onHueChange: ((Float) -> Unit)?        = null

    // ── Paint / layout ────────────────────────────────────────────────────────

    private val dp = resources.displayMetrics.density

    private val fillPaint   = Paint()
    private val whitePaint  = Paint()
    private val blackPaint  = Paint()
    private val huePaint    = Paint(Paint.ANTI_ALIAS_FLAG)
    private val thumbRing   = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = 2.5f * dp; color = Color.WHITE
    }
    private val thumbShadow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = 4.5f * dp; color = Color.argb(90, 0, 0, 0)
    }

    private val hueBarH  = (20 * dp).toInt()
    private val gapH     = (8  * dp).toInt()
    private val thumbR   = 9f * dp

    private var squareH   = 0
    private var hueBarTop = 0

    // ── Gradients ─────────────────────────────────────────────────────────────

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        hueBarTop = h - hueBarH
        squareH   = hueBarTop - gapH
        buildGradients()
    }

    fun buildGradients() {
        if (width == 0 || squareH <= 0) return
        val w  = width.toFloat()
        val sh = squareH.toFloat()

        fillPaint.color = Color.HSVToColor(floatArrayOf(_hue, 1f, 1f))

        whitePaint.shader = LinearGradient(
            0f, 0f, w, 0f,
            Color.WHITE, Color.argb(0, 255, 255, 255), Shader.TileMode.CLAMP
        )
        blackPaint.shader = LinearGradient(
            0f, 0f, 0f, sh,
            Color.TRANSPARENT, Color.BLACK, Shader.TileMode.CLAMP
        )

        val hueColors = intArrayOf(
            0xFFFF0000.toInt(), 0xFFFFFF00.toInt(), 0xFF00FF00.toInt(),
            0xFF00FFFF.toInt(), 0xFF0000FF.toInt(), 0xFFFF00FF.toInt(), 0xFFFF0000.toInt()
        )
        huePaint.shader = LinearGradient(
            0f, 0f, w, 0f, hueColors, null, Shader.TileMode.CLAMP
        )
    }

    // ── Drawing ───────────────────────────────────────────────────────────────

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w  = width.toFloat()
        val sh = squareH.toFloat()

        if (squareH > 0) {
            val r = RectF(0f, 0f, w, sh)
            canvas.drawRect(r, fillPaint)
            canvas.drawRect(r, whitePaint)
            canvas.drawRect(r, blackPaint)

            val tx = _sat * w
            val ty = (1f - _bri) * sh
            canvas.drawCircle(tx, ty, thumbR, thumbShadow)
            canvas.drawCircle(tx, ty, thumbR, thumbRing)
        }

        val barRect = RectF(0f, hueBarTop.toFloat(), w, (hueBarTop + hueBarH).toFloat())
        canvas.drawRoundRect(barRect, hueBarH / 2f, hueBarH / 2f, huePaint)

        val hx = (_hue / 360f) * w
        val hy = hueBarTop + hueBarH / 2f
        canvas.drawCircle(hx, hy, thumbR, thumbShadow)
        canvas.drawCircle(hx, hy, thumbR, thumbRing)
    }

    // ── Touch ─────────────────────────────────────────────────────────────────

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> isUserTouching = true
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                // Notify JS with final value
                onHueChange?.invoke(_hue)
                onSVChange?.invoke(_sat, _bri)
                // Delay clearing the flag so the JS round-trip echo is ignored
                postDelayed({ isUserTouching = false }, 200L)
                return true
            }
        }
        if (event.actionMasked != MotionEvent.ACTION_DOWN &&
            event.actionMasked != MotionEvent.ACTION_MOVE) return true

        val x = event.x.coerceIn(0f, width.toFloat())
        val y = event.y

        when {
            y >= hueBarTop -> {
                _hue = (x / width * 360f).coerceIn(0f, 360f)
                buildGradients()
                invalidate()
                onHueChange?.invoke(_hue)
            }
            squareH > 0 && y in 0f..squareH.toFloat() -> {
                _sat = (x / width).coerceIn(0f, 1f)
                _bri = (1f - y / squareH).coerceIn(0f, 1f)
                invalidate()
                onSVChange?.invoke(_sat, _bri)
            }
        }
        return true
    }
}
