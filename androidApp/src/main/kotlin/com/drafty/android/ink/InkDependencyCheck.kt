package com.drafty.android.ink

import androidx.ink.brush.Brush
import androidx.ink.brush.BrushFamily
import androidx.ink.strokes.Stroke
import androidx.ink.authoring.InProgressStrokesView

internal object InkDependencyCheck {
    val brushFamilyClass = BrushFamily::class
    val brushClass = Brush::class
    val strokeClass = Stroke::class
    val viewClass = InProgressStrokesView::class
}
