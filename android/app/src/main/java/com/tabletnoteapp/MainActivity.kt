package com.tabletnoteapp

import android.view.KeyEvent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

    override fun getMainComponentName(): String = "TabletNoteApp"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        // KEYCODE_STYLUS_BUTTON_PRIMARY = 257 (API 28+)
        // Some devices emit KEYCODE_BUTTON_B (6) instead
        if (keyCode == 257 || keyCode == KeyEvent.KEYCODE_BUTTON_B) {
            emitSpenEvent("spenButtonPress")
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun emitSpenEvent(eventName: String) {
        val reactContext = (application as? ReactApplication)
            ?.reactNativeHost?.reactInstanceManager?.currentReactContext
            ?: return
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit(eventName, null)
    }
}
