package com.drafty.shared.data.db

import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.native.NativeSqliteDriver

class DatabaseDriverFactory {
    fun create(): SqlDriver {
        return NativeSqliteDriver(
            schema = DraftyDatabase.Schema,
            name = "drafty.db"
        )
    }
}
