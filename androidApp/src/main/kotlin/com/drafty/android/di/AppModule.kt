package com.drafty.android.di

import com.drafty.shared.data.db.DatabaseDriverFactory
import org.koin.android.ext.koin.androidContext
import org.koin.dsl.module

val appModule = module {
    single { DatabaseDriverFactory(androidContext()).create() }
}
