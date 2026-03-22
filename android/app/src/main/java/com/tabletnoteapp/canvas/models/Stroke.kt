package com.tabletnoteapp.canvas.models

enum class ToolType { PEN, ERASER, SELECT, HIGHLIGHTER, SCROLL }

data class StrokeStyle(
    val color: Int,
    val thickness: Float,
    val tool: ToolType = ToolType.PEN,
)

data class Stroke(
    val points: MutableList<Point> = mutableListOf(),
    var style: StrokeStyle,
) {
    fun addPoint(point: Point) = points.add(point)
    val isEmpty get() = points.isEmpty()
}

sealed class UndoAction {
    data class AddStroke(val stroke: Stroke) : UndoAction()
    // entries: (originalIndex, stroke) — index in committedStrokes at gesture-start snapshot
    data class EraseStrokes(val entries: List<Pair<Int, Stroke>>) : UndoAction()
    data class MoveStrokes(val indices: List<Int>, val dx: Float, val dy: Float) : UndoAction()
    data class ResizeStrokes(
        val indices: List<Int>,
        val scaleX: Float, val scaleY: Float,
        val pivotX: Float, val pivotY: Float,
    ) : UndoAction()
}
