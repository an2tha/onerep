package com.ananthh.onerep

import android.animation.ValueAnimator
import android.content.ComponentCallbacks
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlin.math.max

/**
 * The Android counterpart of `NativeTabBarPlugin.swift`: a floating pill of
 * destinations with a detached round button on its right, laid over the
 * WebView. Same JS surface, same geometry, same event.
 *
 * Where iOS asks the system for glass, Android has nothing to give — real
 * behind-the-view blur is a window-level trick that a child view cannot have —
 * so the pill wears a heavy translucent fill and an elevation shadow instead.
 * Everything else is a straight port.
 */
@CapacitorPlugin(name = "NativeTabBar")
class NativeTabBarPlugin : Plugin() {

    private data class Item(
        val id: String,
        val symbol: String,
        val label: String,
        val prominent: Boolean
    )

    private var container: FrameLayout? = null
    private var pill: FrameLayout? = null
    private var orb: FrameLayout? = null
    private var highlight: View? = null
    /** The chip has no resting position until a slot has been measured. */
    private var chipSeated = false
    private var buttons: List<Pair<Item, ImageView>> = emptyList()
    private var items: List<Item> = emptyList()
    private var expanded = false
    private var toggleButton: ImageView? = null
    private var selectedId = ""
    private var visible = true

    /** null = follow the system; Coach forces dark over its own backdrop. */
    private var forcedDark: Boolean? = null

    private val barHeight = 60f
    private val itemWidth = 58f
    private val chipInsetX = 2f
    private val chipInsetY = 8f

    /** Repaints when the system flips light/dark under a running app. */
    private val themeWatcher = object : ComponentCallbacks {
        override fun onConfigurationChanged(newConfig: Configuration) = applyColors()
        override fun onLowMemory() = Unit
    }

    override fun load() {
        activity.application.registerComponentCallbacks(themeWatcher)
    }

    // ── plugin surface ────────────────────────────────────────────────────────

    @PluginMethod
    fun configure(call: PluginCall) {
        val raw = call.getArray("items")
        val parsed = buildList {
            for (index in 0 until (raw?.length() ?: 0)) {
                val entry = runCatching {
                    JSObject.fromJSONObject(raw!!.getJSONObject(index))
                }.getOrNull() ?: continue
                val id = entry.getString("id") ?: continue
                val symbol = entry.getString("symbol") ?: continue
                add(
                    Item(
                        id = id,
                        symbol = symbol,
                        label = entry.getString("label") ?: id,
                        prominent = entry.getBool("prominent") ?: false
                    )
                )
            }
        }
        val selected = call.getString("selectedId") ?: parsed.firstOrNull()?.id ?: ""
        onUi {
            items = parsed
            selectedId = selected
            rebuild()
            call.resolve()
        }
    }

    @PluginMethod
    fun setSelected(call: PluginCall) {
        val id = call.getString("id") ?: ""
        onUi {
            applySelection(id, animated = true)
            call.resolve()
        }
    }

    @PluginMethod
    fun setVisible(call: PluginCall) {
        val next = call.getBoolean("visible", true) ?: true
        onUi {
            applyVisibility(next)
            call.resolve()
        }
    }

    @PluginMethod
    fun setAppearance(call: PluginCall) {
        val style = call.getString("style") ?: "system"
        onUi {
            forcedDark = when (style) {
                "light" -> false
                "dark" -> true
                else -> null
            }
            applyColors()
            call.resolve()
        }
    }

    override fun handleOnDestroy() {
        activity.application.unregisterComponentCallbacks(themeWatcher)
        container?.let { (it.parent as? ViewGroup)?.removeView(it) }
        container = null
        super.handleOnDestroy()
    }

    // ── construction ──────────────────────────────────────────────────────────

    private fun rebuild() {
        container?.let { (it.parent as? ViewGroup)?.removeView(it) }
        val host = activity.findViewById<ViewGroup>(android.R.id.content) ?: return
        if (items.isEmpty()) return
        expanded = false
        val container = FrameLayout(activity).apply {
            clipChildren = false
            layoutParams = FrameLayout.LayoutParams(dp(232f), dp(items.size * 48f + 84f), Gravity.BOTTOM or Gravity.START).apply { leftMargin = dp(16f) }
        }
        val menu = FrameLayout(activity).apply {
            elevation = dp(8f).toFloat()
            layoutParams = FrameLayout.LayoutParams(dp(232f), dp(items.size * 48f + 12f), Gravity.BOTTOM).apply { bottomMargin = dp(72f) }
            visibility = View.GONE
            alpha = 0f
        }
        val strip = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(6f), 0, dp(6f))
        }
        val collected = mutableListOf<Pair<Item, ImageView>>()
        items.forEach { item ->
            val row = LinearLayout(activity).apply {
                gravity = Gravity.CENTER_VERTICAL
                layoutParams = LinearLayout.LayoutParams(-1, dp(48f))
                contentDescription = item.label
                isFocusable = true
                setOnClickListener { didTap(item.id) }
            }
            val icon = makeButton(item, 48f, 22f).apply {
                layoutParams = LinearLayout.LayoutParams(dp(48f), dp(48f))
                setPadding(dp(13f), dp(13f), dp(13f), dp(13f))
                isClickable = false
                isFocusable = false
                importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            }
            row.addView(icon)
            row.addView(TextView(activity).apply {
                text = item.label
                textSize = 16f
                setTextColor(iconTint(isDark(), true))
                importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                tag = "navigation-label"
            })
            strip.addView(row)
            collected += item to icon
        }
        menu.addView(strip)
        container.addView(menu)
        val orb = FrameLayout(activity).apply {
            elevation = dp(8f).toFloat()
            layoutParams = FrameLayout.LayoutParams(dp(60f), dp(60f), Gravity.BOTTOM or Gravity.START)
        }
        val toggle = ImageView(activity).apply {
            layoutParams = FrameLayout.LayoutParams(-1, -1)
            setPadding(dp(18f), dp(18f), dp(18f), dp(18f))
            isFocusable = true
            setOnClickListener { setExpanded(!expanded) }
        }
        orb.addView(toggle)
        container.addView(orb)
        host.addView(container)
        this.container = container
        this.pill = menu
        this.orb = orb
        this.toggleButton = toggle
        this.buttons = collected
        applyColors()
        applyInsets(container)
        applySelection(selectedId, false)
        container.visibility = if (visible) View.VISIBLE else View.GONE
    }

    private fun setExpanded(next: Boolean) {
        expanded = next
        val menu = pill ?: return
        menu.animate().cancel()
        if (next) menu.visibility = View.VISIBLE
        menu.importantForAccessibility = if (next) View.IMPORTANT_FOR_ACCESSIBILITY_AUTO else View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        toggleButton?.contentDescription = if (next) "Close navigation" else "Open navigation"
        toggleButton?.setImageResource(if (next) android.R.drawable.ic_menu_close_clear_cancel else iconFor(items.firstOrNull { it.id == selectedId }?.symbol ?: "house.fill"))
        menu.animate().alpha(if (next) 1f else 0f).translationY(if (next) 0f else dp(12f).toFloat()).setDuration(240).withEndAction {
            if (!expanded) menu.visibility = View.GONE
        }.start()
    }

    /**
     * The resting slot width, tightened until pill + orb fit the screen with
     * a 16dp margin either side. Never wider than `itemWidth`: on a big phone
     * the bar should stay the size it was designed at, not stretch.
     */
    private fun fittedItemWidth(count: Int, hasOrb: Boolean): Float {
        if (count <= 0) return itemWidth
        val screen = activity.resources.displayMetrics.widthPixels /
            activity.resources.displayMetrics.density
        val orbRoom = if (hasOrb) barHeight + 10f else 0f
        val available = screen - 32f - orbRoom - 12f
        return itemWidth.coerceAtMost(available / count).coerceAtLeast(34f)
    }

    /**
     * The bar deliberately hangs 8dp below the safe area, into the gesture
     * handle's strip — floating chrome, not a docked bar.
     */
    private fun applyInsets(container: View) {
        ViewCompat.setOnApplyWindowInsetsListener(container) { view, insets ->
            val bottom = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            ).bottom
            (view.layoutParams as? FrameLayout.LayoutParams)?.let { params ->
                params.bottomMargin = max(0, bottom - dp(8f))
                view.layoutParams = params
            }
            insets
        }
        ViewCompat.requestApplyInsets(container)
    }

    private fun makeButton(item: Item, slotWidth: Float, iconSize: Float): ImageView =
        ImageView(activity).apply {
            setImageResource(iconFor(item.symbol))
            scaleType = ImageView.ScaleType.FIT_CENTER
            // Padding, not maxWidth: the glyph then scales to exactly iconSize
            // no matter how the slot is measured.
            val inset = dp((slotWidth - iconSize) / 2)
            val insetY = dp((barHeight - iconSize) / 2)
            setPadding(inset, insetY, inset, insetY)
            contentDescription = item.label
            tag = "native-tab-${item.id}"
            isClickable = true
            isFocusable = true
            setOnClickListener { view ->
                    didTap(item.id)
            }
        }

    /** SF Symbol names in, Android vectors out. */
    private fun iconFor(symbol: String): Int = when (symbol) {
        "house" , "house.fill" -> R.drawable.ic_tab_house
        "book.closed.fill" -> R.drawable.ic_tab_journal
        "fork.knife" -> R.drawable.ic_tab_fork_knife
        "dumbbell" , "dumbbell.fill" -> R.drawable.ic_tab_dumbbell
        "bicycle" -> R.drawable.ic_tab_bicycle
        "chart.bar" , "chart.bar.fill" -> R.drawable.ic_tab_chart_bar
        "heart.text.square" , "heart.text.square.fill" -> R.drawable.ic_tab_heart_text_square
        "sparkles" , "rocket.fill" -> R.drawable.ic_tab_sparkles
        "gearshape" , "gearshape.fill" -> R.drawable.ic_tab_gearshape
        else -> R.drawable.ic_tab_house
    }

    // ── colour ────────────────────────────────────────────────────────────────

    private fun isDark(): Boolean = forcedDark ?: run {
        val mode = activity.resources.configuration.uiMode and
            Configuration.UI_MODE_NIGHT_MASK
        mode == Configuration.UI_MODE_NIGHT_YES
    }

    private fun applyColors() {
        val dark = isDark()
        // No blur to hide behind, so the fill carries the whole surface: near
        // opaque, or the content scrolling under it turns the icons to mush.
        val surface = if (dark) Color.argb(247, 28, 28, 30) else Color.argb(247, 250, 250, 252)
        val hairline = if (dark) Color.argb(46, 255, 255, 255) else Color.argb(20, 0, 0, 0)

        pill?.background = capsule(dp(barHeight / 2).toFloat(), surface, hairline)
        orb?.background = capsule(dp(barHeight / 2).toFloat(), surface, hairline)

        highlight?.background = GradientDrawable().apply {
            cornerRadius = dp((barHeight - chipInsetY * 2) / 3).toFloat()
            setColor(
                if (dark) Color.argb(115, 0, 0, 0) else Color.argb(26, 0, 0, 0)
            )
        }

        buttons.forEach { (item, button) ->
            button.setColorFilter(iconTint(dark, active = item.id == selectedId))
        }
    }

    private fun capsule(radius: Float, fill: Int, stroke: Int) = GradientDrawable().apply {
        cornerRadius = radius
        setColor(fill)
        setStroke(dp(1f).coerceAtLeast(1), stroke)
    }

    private fun iconTint(dark: Boolean, active: Boolean): Int = when {
        dark && active -> Color.WHITE
        dark -> Color.argb(150, 255, 255, 255)
        active -> Color.argb(235, 0, 0, 0)
        else -> Color.argb(120, 0, 0, 0)
    }

    // ── behaviour ─────────────────────────────────────────────────────────────

    private fun didTap(id: String) {
        applySelection(id, animated = true)
        notifyListeners("tabSelected", JSObject().put("id", id))
    }

    private fun applySelection(id: String, animated: Boolean) {
        selectedId = id
        buttons.forEach { (item, button) ->
            button.setColorFilter(iconTint(isDark(), item.id == id))
            (button.parent as? View)?.isSelected = item.id == id
        }
        setExpanded(false)
    }

    private fun applyVisibility(next: Boolean) {
        visible = next
        if (!next) setExpanded(false)
        val container = container ?: return
        // Alpha alone leaves a fully transparent but still-touchable view on
        // top of the WebView, silently eating taps on whatever it's hiding.
        // GONE has to land after the fade out, and before it on fade in, or
        // the animation has nothing visible to animate.
        if (next) container.visibility = View.VISIBLE
        container.animate()
            .alpha(if (next) 1f else 0f)
            .translationY(if (next) 0f else dp(16f).toFloat())
            .setDuration(250)
            .withEndAction { if (!next) container.visibility = View.GONE }
            .start()
    }

    // ── plumbing ──────────────────────────────────────────────────────────────

    private fun onUi(block: () -> Unit) = activity.runOnUiThread(block)

    private fun dp(value: Float): Int = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, value, activity.resources.displayMetrics
    ).toInt()
}
