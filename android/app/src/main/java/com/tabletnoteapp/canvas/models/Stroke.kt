package com.tabletnoteapp.canvas.models

enum class ToolType { PEN, ERASER }

data class StrokeStyle(
    val color: Int,
    val thickness: Float,
    val tool: ToolType = ToolType.PEN,
)

data class Stroke(
    val points: MutableList<Point> = mutableListOf(),
    val style: StrokeStyle,
) {
    fun addPoint(point: Point) = points.add(point)
    val isEmpty get() = points.isEmpty()
}
