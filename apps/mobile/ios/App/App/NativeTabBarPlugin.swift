import Capacitor
import UIKit

/// A view that only claims touches that land on one of its subviews, so the
/// floating bar never swallows taps meant for the WebView around it.
private final class PassthroughView: UIView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let view = super.hitTest(point, with: event)
        return view === self ? nil : view
    }
}

/// The floating native tab bar: a glass pill of destinations plus a detached
/// circular button on the right. On iOS 26 the pill wears the system's liquid
/// glass; earlier systems get the closest chrome material.
///
/// The web app stays the source of truth — this bar only reports taps through
/// `tabSelected` events and mirrors whatever selection the app pushes back.
@objc(NativeTabBarPlugin)
public class NativeTabBarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeTabBarPlugin"
    public let jsName = "NativeTabBar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSelected", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVisible", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAppearance", returnType: CAPPluginReturnPromise)
    ]

    private struct Item {
        let id: String
        let symbol: String
        let label: String
        let prominent: Bool
    }

    private var container: PassthroughView?
    private var pill: UIVisualEffectView?
    private var highlight: UIView?
    private var buttons: [(item: Item, button: UIButton)] = []
    private var items: [Item] = []
    private var selectedId = ""
    private var visible = true
    /// Some screens (Coach) paint their own dark backdrop regardless of the
    /// system setting, so the web app tells us which way to lean.
    private var appearance: UIUserInterfaceStyle = .unspecified

    private let barHeight: CGFloat = 60
    private let itemWidth: CGFloat = 58
    /// How far the selection chip sits inside its icon's slot.
    private let chipInsetX: CGFloat = 2
    private let chipInsetY: CGFloat = 8

    // ── plugin surface ────────────────────────────────────────────────────────

    @objc func configure(_ call: CAPPluginCall) {
        let rawItems = call.getArray("items") as? [JSObject] ?? []
        let parsed = rawItems.compactMap { raw -> Item? in
            guard let id = raw["id"] as? String,
                  let symbol = raw["symbol"] as? String else { return nil }
            return Item(
                id: id,
                symbol: symbol,
                label: raw["label"] as? String ?? id,
                prominent: raw["prominent"] as? Bool ?? false
            )
        }
        let selected = call.getString("selectedId") ?? parsed.first?.id ?? ""
        DispatchQueue.main.async {
            self.items = parsed
            self.selectedId = selected
            self.rebuild()
            call.resolve()
        }
    }

    @objc func setSelected(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        DispatchQueue.main.async {
            self.applySelection(id, animated: true)
            call.resolve()
        }
    }

    @objc func setVisible(_ call: CAPPluginCall) {
        let next = call.getBool("visible") ?? true
        DispatchQueue.main.async {
            self.applyVisibility(next)
            call.resolve()
        }
    }

    @objc func setAppearance(_ call: CAPPluginCall) {
        let style: UIUserInterfaceStyle
        switch call.getString("style") ?? "system" {
        case "light": style = .light
        case "dark": style = .dark
        default: style = .unspecified
        }
        DispatchQueue.main.async {
            self.appearance = style
            self.container?.overrideUserInterfaceStyle = style
            call.resolve()
        }
    }

    // ── construction ──────────────────────────────────────────────────────────

    private func glassEffect() -> UIVisualEffect {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            return UIGlassEffect()
        }
        #endif
        // The adaptive material, not the …Dark one: in light mode a dark pill
        // swallowed the icons whole.
        return UIBlurEffect(style: .systemChromeMaterial)
    }

    /// White-on-dark and black-on-light, resolved against whatever style the
    /// container is overridden to.
    private func iconTint(active: Bool) -> UIColor {
        active ? .label : .secondaryLabel
    }

    private var chipColor: UIColor {
        UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor.black.withAlphaComponent(0.45)
                : UIColor.black.withAlphaComponent(0.10)
        }
    }

    private func rebuild() {
        container?.removeFromSuperview()
        buttons = []
        highlight = nil
        pill = nil

        guard let host = bridge?.viewController?.view, !items.isEmpty else {
            container = nil
            return
        }

        let container = PassthroughView()
        container.translatesAutoresizingMaskIntoConstraints = false
        container.overrideUserInterfaceStyle = appearance
        host.addSubview(container)
        NSLayoutConstraint.activate([
            container.leadingAnchor.constraint(equalTo: host.leadingAnchor),
            container.trailingAnchor.constraint(equalTo: host.trailingAnchor),
            // Sits below the safe-area line, into the home-indicator strip —
            // floating chrome, not a docked bar.
            container.bottomAnchor.constraint(
                equalTo: host.safeAreaLayoutGuide.bottomAnchor, constant: 8),
            container.heightAnchor.constraint(equalToConstant: barHeight)
        ])
        self.container = container

        let pillItems = items.filter { !$0.prominent }
        let prominentItems = items.filter { $0.prominent }

        // The glass pill of ordinary destinations.
        let pill = UIVisualEffectView(effect: glassEffect())
        pill.translatesAutoresizingMaskIntoConstraints = false
        pill.layer.cornerRadius = barHeight / 2
        pill.layer.cornerCurve = .continuous
        pill.clipsToBounds = true
        container.addSubview(pill)

        // The moving selection chip sits behind the icons inside the pill.
        let highlight = UIView()
        highlight.backgroundColor = chipColor
        // A squircle, not a capsule: the chip should read as a rounded tile
        // sitting inside the pill, the way the system does it.
        highlight.layer.cornerRadius = (barHeight - chipInsetY * 2) / 3
        highlight.layer.cornerCurve = .continuous
        highlight.frame = .zero
        pill.contentView.addSubview(highlight)
        self.highlight = highlight

        let stack = UIStackView()
        stack.axis = .horizontal
        stack.distribution = .fillEqually
        stack.translatesAutoresizingMaskIntoConstraints = false
        pill.contentView.addSubview(stack)

        for item in pillItems {
            let button = makeButton(for: item, pointSize: 19)
            stack.addArrangedSubview(button)
            buttons.append((item, button))
        }

        var constraints: [NSLayoutConstraint] = [
            pill.heightAnchor.constraint(equalToConstant: barHeight),
            pill.widthAnchor.constraint(
                equalToConstant: CGFloat(pillItems.count) * itemWidth + 12),
            pill.centerYAnchor.constraint(equalTo: container.centerYAnchor),
            stack.topAnchor.constraint(equalTo: pill.contentView.topAnchor),
            stack.bottomAnchor.constraint(equalTo: pill.contentView.bottomAnchor),
            stack.leadingAnchor.constraint(
                equalTo: pill.contentView.leadingAnchor, constant: 6),
            stack.trailingAnchor.constraint(
                equalTo: pill.contentView.trailingAnchor, constant: -6)
        ]

        // The detached round button (Coach), to the pill's right.
        if let prominent = prominentItems.first {
            let orb = UIVisualEffectView(effect: glassEffect())
            orb.translatesAutoresizingMaskIntoConstraints = false
            orb.layer.cornerRadius = barHeight / 2
            orb.layer.cornerCurve = .continuous
            orb.clipsToBounds = true
            container.addSubview(orb)

            let button = makeButton(for: prominent, pointSize: 22)
            button.translatesAutoresizingMaskIntoConstraints = false
            orb.contentView.addSubview(button)
            buttons.append((prominent, button))

            constraints.append(contentsOf: [
                orb.widthAnchor.constraint(equalToConstant: barHeight),
                orb.heightAnchor.constraint(equalToConstant: barHeight),
                orb.centerYAnchor.constraint(equalTo: container.centerYAnchor),
                orb.leadingAnchor.constraint(
                    equalTo: pill.trailingAnchor, constant: 10),
                button.topAnchor.constraint(equalTo: orb.contentView.topAnchor),
                button.bottomAnchor.constraint(equalTo: orb.contentView.bottomAnchor),
                button.leadingAnchor.constraint(equalTo: orb.contentView.leadingAnchor),
                button.trailingAnchor.constraint(equalTo: orb.contentView.trailingAnchor),
                // Pill + orb sit centred as one composition.
                pill.centerXAnchor.constraint(
                    equalTo: container.centerXAnchor,
                    constant: -(barHeight + 10) / 2)
            ])
        } else {
            constraints.append(
                pill.centerXAnchor.constraint(equalTo: container.centerXAnchor))
        }

        NSLayoutConstraint.activate(constraints)
        self.pill = pill

        container.alpha = visible ? 1 : 0
        host.layoutIfNeeded()
        applySelection(selectedId, animated: false)
    }

    private func makeButton(for item: Item, pointSize: CGFloat) -> UIButton {
        let button = UIButton(type: .system)
        let config = UIImage.SymbolConfiguration(
            pointSize: pointSize, weight: .medium)
        button.setImage(
            UIImage(systemName: item.symbol, withConfiguration: config),
            for: .normal)
        button.tintColor = iconTint(active: false)
        button.accessibilityLabel = item.label
        button.accessibilityIdentifier = "native-tab-\(item.id)"
        button.addAction(
            UIAction { [weak self] _ in self?.didTap(item.id) }, for: .touchUpInside)
        return button
    }

    // ── behaviour ─────────────────────────────────────────────────────────────

    private func didTap(_ id: String) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        applySelection(id, animated: true)
        notifyListeners("tabSelected", data: ["id": id])
    }

    private func applySelection(_ id: String, animated: Bool) {
        selectedId = id
        for (item, button) in buttons {
            let active = item.id == id
            button.tintColor = iconTint(active: active)
            button.accessibilityTraits = active ? [.button, .selected] : [.button]
        }

        guard let highlight, let pill else { return }
        guard let target = buttons.first(where: { $0.item.id == id && !$0.item.prominent }) else {
            // Selection moved to the prominent orb (or nowhere): retire the chip.
            UIView.animate(withDuration: animated ? 0.2 : 0) { highlight.alpha = 0 }
            return
        }

        let frame = target.button.superview!
            .convert(target.button.frame, to: pill.contentView)
            .insetBy(dx: chipInsetX, dy: chipInsetY)
        let apply = {
            highlight.alpha = 1
            highlight.frame = frame
        }
        if animated {
            UIView.animate(
                withDuration: 0.35, delay: 0,
                usingSpringWithDamping: 0.8, initialSpringVelocity: 0.4,
                options: [.allowUserInteraction], animations: apply)
        } else {
            apply()
        }
    }

    private func applyVisibility(_ next: Bool) {
        visible = next
        guard let container else { return }
        UIView.animate(
            withDuration: 0.25, delay: 0, options: [.curveEaseOut]
        ) {
            container.alpha = next ? 1 : 0
            container.transform = next
                ? .identity
                : CGAffineTransform(translationX: 0, y: 16)
        }
    }
}
