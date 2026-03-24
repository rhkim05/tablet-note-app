package com.tabletnoteapp.canvas.models

enum class ToolType { PEN, ERASER, SELECT, HIGHLIGHTER, SCROLL, TEXT, LASER, SHAPES }

enum class ShapeType { LINE, ARROW, RECTANGLE, OVAL }

data class Shape(
    val id: String,
    var type: ShapeType,
    var x1: Float,
    var y1: Float,
    var x2: Float,
    var y2: Float,
    var color: Int,
    var thickness: Float,
)

data class TextElement(
    val id: String,
    var text: String,
    var x: Float,
    var y: Float,
    var width: Float,
    var height: Float,
    var fontSize: Float,
    var color: Int,
    var bold: Boolean,
    var italic: Boolean,
    var fontFamily: String,
)

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
    data class AddShape(val shape: Shape) : UndoAction()
    data class AddText(val element: TextElement) : UndoAction()
    data class DeleteText(val element: TextElement) : UndoAction()
    data class EditText(
        val id: String,
        val before: TextElement,
        val after: TextElement,
    ) : UndoAction()
}
