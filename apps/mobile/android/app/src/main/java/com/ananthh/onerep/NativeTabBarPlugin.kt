package com.ananthh.onerep

import android.animation.ValueAnimator
import android.content.ComponentCallbacks
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
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
        container = null
        pill = null
        orb = null
        highlight = null
        chipSeated = false
        buttons = emptyList()

        // The activity's content frame, not the WebView's parent: it reliably
        // honours FrameLayout gravity and sits above the whole layout.
        val host = activity.findViewById<ViewGroup>(android.R.id.content) ?: return
        if (items.isEmpty()) return

        val pillItems = items.filter { !it.prominent }
        val prominent = items.firstOrNull { it.prominent }
        val collected = mutableListOf<Pair<Item, ImageView>>()

        // A plain FrameLayout is already a passthrough: it is not clickable, so
        // taps that miss the pill fall through to the WebView underneath.
        val container = FrameLayout(activity).apply {
            clipChildren = false
            clipToPadding = false
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(barHeight), Gravity.BOTTOM
            )
        }

        // Pill and orb ride in a centred row, so the pair reads as one
        // composition rather than two floating things.
        val row = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            clipChildren = false
            clipToPadding = false
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
                Gravity.CENTER
            )
        }

        // Six destinations at the resting slot width are wider than a phone,
        // so the slot is what gives: the pill keeps its margins and the orb
        // keeps its size, and the icons sit closer together instead of the
        // right-hand end of the bar walking off the screen.
        val slotWidth = fittedItemWidth(pillItems.size, prominent != null)

        val pill = FrameLayout(activity).apply {
            elevation = dp(8f).toFloat()
            setPadding(dp(6f), 0, dp(6f), 0)
            layoutParams = LinearLayout.LayoutParams(
                dp(pillItems.size * slotWidth + 12f), dp(barHeight)
            )
        }

        // The moving selection chip sits behind the icons inside the pill. A
        // squircle, not a capsule: a rounded tile inside a pill, as iOS has it.
        val highlight = View(activity).apply {
            layoutParams = FrameLayout.LayoutParams(
                dp(slotWidth - chipInsetX * 2), dp(barHeight - chipInsetY * 2),
                Gravity.START or Gravity.CENTER_VERTICAL
            )
            alpha = 0f
        }
        pill.addView(highlight)

        val strip = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        pillItems.forEach { item ->
            val button = makeButton(item, slotWidth = slotWidth, iconSize = 22f)
            button.layoutParams =
                LinearLayout.LayoutParams(dp(slotWidth), ViewGroup.LayoutParams.MATCH_PARENT)
            strip.addView(button)
            collected += item to button
        }
        pill.addView(strip)
        row.addView(pill)

        if (prominent != null) {
            val orbView = FrameLayout(activity).apply {
                elevation = dp(8f).toFloat()
                layoutParams = LinearLayout.LayoutParams(dp(barHeight), dp(barHeight))
                    .apply { marginStart = dp(10f) }
            }
            val button = makeButton(prominent, slotWidth = barHeight, iconSize = 25f)
            button.layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
            )
            orbView.addView(button)
            row.addView(orbView)
            collected += prominent to button
            orb = orbView
        }

        container.addView(row)
        container.alpha = if (visible) 1f else 0f
        container.visibility = if (visible) View.VISIBLE else View.GONE
        host.addView(container)

        this.container = container
        this.pill = pill
        this.highlight = highlight
        this.buttons = collected

        applyColors()
        applyInsets(container)
        // Slot geometry is only known post-layout, so seat the chip then.
        container.post { applySelection(selectedId, animated = false) }
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
                view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                didTap(item.id)
            }
        }

    /** SF Symbol names in, Android vectors out. */
    private fun iconFor(symbol: String): Int = when (symbol) {
        "house" -> R.drawable.ic_tab_house
        "fork.knife" -> R.drawable.ic_tab_fork_knife
        "dumbbell" -> R.drawable.ic_tab_dumbbell
        "chart.bar" -> R.drawable.ic_tab_chart_bar
        "heart.text.square" -> R.drawable.ic_tab_heart_text_square
        "sparkles" -> R.drawable.ic_tab_sparkles
        "gearshape" -> R.drawable.ic_tab_gearshape
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
        val dark = isDark()
        buttons.forEach { (item, button) ->
            val active = item.id == id
            button.setColorFilter(iconTint(dark, active))
            button.isSelected = active
        }

        val highlight = highlight ?: return
        val target = buttons.firstOrNull { it.first.id == id && !it.first.prominent }
        if (target == null) {
            // Selection moved to the prominent orb (or nowhere): retire the chip.
            highlight.animate().alpha(0f).setDuration(if (animated) 200 else 0).start()
            return
        }

        val x = (target.second.left + pill!!.paddingLeft + dp(chipInsetX)).toFloat()
        highlight.alpha = 1f
        val shouldAnimate = animated && chipSeated
        chipSeated = true
        if (shouldAnimate) {
            ValueAnimator.ofFloat(highlight.translationX, x).apply {
                duration = 350
                interpolator = OvershootInterpolator(1.1f)
                addUpdateListener { highlight.translationX = it.animatedValue as Float }
            }.start()
        } else {
            highlight.translationX = x
        }
    }

    private fun applyVisibility(next: Boolean) {
        visible = next
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
