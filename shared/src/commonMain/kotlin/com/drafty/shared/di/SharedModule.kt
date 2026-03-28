package com.drafty.shared.di

import com.drafty.shared.data.db.DraftyDatabase
import com.drafty.shared.data.db.createDatabase
import org.koin.core.module.Module
import org.koin.dsl.module

val sharedModule: Module = module {
    single<DraftyDatabase> { createDatabase(get()) }
}
