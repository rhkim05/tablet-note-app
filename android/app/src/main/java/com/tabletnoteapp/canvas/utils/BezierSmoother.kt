// Bezeir 알고리즘을 이용하여 선을 부드럽게 만들어주는 로직 작성
package com.tabletnoteapp.canvas.utils

import android.graphics.Path
import com.tabletnoteapp.canvas.models.Point

/**
 * Converts a list of raw touch Points into a smooth Path using cubic Bezier curves.
 * Uses the midpoint algorithm: control points are midpoints between consecutive points,
 * and actual curve anchors are midpoints between those midpoints.
 */
object BezierSmoother {

    /**
     * Build a smooth Path from a list of points.
     * Returns null if there are fewer than 2 points.
     */
    fun buildPath(points: List<Point>): Path? {
        if (points.size < 2) return null

        val path = Path()
        path.moveTo(points[0].x, points[0].y)

        if (points.size == 2) {
            path.lineTo(points[1].x, points[1].y)
            return path
        }

        // For 3+ points, use quadratic bezier curves through midpoints
        for (i in 1 until points.size - 1) {
            val prev = points[i - 1]
            val curr = points[i]
            val next = points[i + 1]

            // Midpoint between curr and next — this is where the curve ends
            val midX = (curr.x + next.x) / 2f
            val midY = (curr.y + next.y) / 2f

            // curr is the control point, mid is the anchor
            path.quadTo(curr.x, curr.y, midX, midY)
        }

        // Line to the final point
        val last = points.last()
        path.lineTo(last.x, last.y)

        return path
    }

    /**
     * Returns a smoothed subset path for just the last few points (incremental drawing).
     * Useful for updating the in-progress stroke without rebuilding the full path.
     */
    fun buildIncrementalPath(points: List<Point>): Path? {
        if (points.size < 2) return null

        val path = Path()
        val size = points.size

        return when {
            size == 2 -> {
                path.moveTo(points[0].x, points[0].y)
                path.lineTo(points[1].x, points[1].y)
                path
            }
            else -> {
                // Only recalculate the last segment
                val prev = points[size - 2]
                val curr = points[size - 1]
                val midX = (prev.x + curr.x) / 2f
                val midY = (prev.y + curr.y) / 2f

                path.moveTo(midX, midY)
                path.lineTo(curr.x, curr.y)
                path
            }
        }
    }
}
