package com.tabletnoteapp.canvas.models

data class Point(
        val x: Float,
        val y: Float,
        val pressure: Float = 1.0f,
        val timestamp: Long = System.currentTimeMillis(),
)
