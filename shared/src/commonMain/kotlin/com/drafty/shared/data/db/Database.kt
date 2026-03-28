package com.drafty.shared.data.db

import app.cash.sqldelight.db.SqlDriver

fun createDatabase(driver: SqlDriver): DraftyDatabase {
    return DraftyDatabase(driver)
}
