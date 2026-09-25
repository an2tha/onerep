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

/// A single navigation button anchored left, with an expanding horizontal tab bar.
/// The web app owns routing and reports selection and visibility through the bridge.
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
    private var tabStack: UIStackView?
    private var collapsedWidth: NSLayoutConstraint?
    private var expandedTrailing: NSLayoutConstraint?
    private var buttons: [(item: Item, button: UIButton)] = []
    private var items: [Item] = []
    private var expanded = false
    private var toggleButton: UIButton?
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
        expanded = false
        guard let host = bridge?.viewController?.view, !items.isEmpty else { return }
        let container = PassthroughView()
        container.translatesAutoresizingMaskIntoConstraints = false
        container.overrideUserInterfaceStyle = appearance
        host.addSubview(container)
        NSLayoutConstraint.activate([
            container.leadingAnchor.constraint(equalTo: host.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            container.trailingAnchor.constraint(equalTo: host.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            container.bottomAnchor.constraint(equalTo: host.safeAreaLayoutGuide.bottomAnchor, constant: -8),
            container.heightAnchor.constraint(equalToConstant: barHeight)
        ])
        self.container = container
        let pill = UIVisualEffectView(effect: glassEffect())
        pill.translatesAutoresizingMaskIntoConstraints = false
        pill.layer.cornerRadius = barHeight / 2
        pill.layer.cornerCurve = .continuous
        pill.clipsToBounds = true
        container.addSubview(pill)
        self.pill = pill
        collapsedWidth = pill.widthAnchor.constraint(equalToConstant: barHeight)
        expandedTrailing = pill.trailingAnchor.constraint(equalTo: container.trailingAnchor)
        NSLayoutConstraint.activate([
            pill.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            pill.topAnchor.constraint(equalTo: container.topAnchor),
            pill.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            collapsedWidth!
        ])
        let stack = UIStackView()
        stack.axis = .horizontal
        stack.distribution = .fillEqually
        stack.translatesAutoresizingMaskIntoConstraints = false
        pill.contentView.addSubview(stack)
        tabStack = stack
        for item in items {
            let button = makeButton(for: item, pointSize: 21)
            button.layer.cornerRadius = 18
            button.layer.cornerCurve = .continuous
            stack.addArrangedSubview(button)
            buttons.append((item, button))
        }
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: pill.contentView.leadingAnchor, constant: 6),
            stack.widthAnchor.constraint(equalTo: container.widthAnchor, constant: -12),
            stack.topAnchor.constraint(equalTo: pill.contentView.topAnchor, constant: 6),
            stack.bottomAnchor.constraint(equalTo: pill.contentView.bottomAnchor, constant: -6)
        ])
        let toggle = UIButton(type: .system)
        toggle.translatesAutoresizingMaskIntoConstraints = false
        toggle.tintColor = .label
        toggle.accessibilityLabel = String(localized: "Open navigation")
        toggle.addAction(UIAction { [weak self] _ in self?.setExpanded(true) }, for: .touchUpInside)
        pill.contentView.addSubview(toggle)
        toggleButton = toggle
        NSLayoutConstraint.activate([
            toggle.leadingAnchor.constraint(equalTo: pill.contentView.leadingAnchor),
            toggle.widthAnchor.constraint(equalToConstant: barHeight),
            toggle.topAnchor.constraint(equalTo: pill.contentView.topAnchor),
            toggle.bottomAnchor.constraint(equalTo: pill.contentView.bottomAnchor)
        ])
        stack.alpha = 0
        stack.isHidden = true
        container.isHidden = !visible
        host.layoutIfNeeded()
        applySelection(selectedId, animated: false)
    }

    private func setExpanded(_ next: Bool, animated: Bool = true) {
        guard let container, let stack = tabStack, let toggle = toggleButton else { return }
        container.layoutIfNeeded()
        expanded = next
        stack.isHidden = false
        toggle.isHidden = false
        stack.isUserInteractionEnabled = next
        stack.accessibilityElementsHidden = !next
        toggle.isUserInteractionEnabled = !next
        toggle.accessibilityElementsHidden = next
        collapsedWidth?.isActive = false
        expandedTrailing?.isActive = false
        if next { expandedTrailing?.isActive = true } else { collapsedWidth?.isActive = true }
        let duration = animated && !UIAccessibility.isReduceMotionEnabled ? 0.3 : 0
        UIView.animate(withDuration: duration, delay: 0, options: [.beginFromCurrentState, .curveEaseInOut]) {
            container.layoutIfNeeded()
            stack.alpha = next ? 1 : 0
            toggle.alpha = next ? 0 : 1
        } completion: { [weak self] _ in
            guard let self else { return }
            stack.isHidden = !self.expanded
            toggle.isHidden = self.expanded
        }
    }

    private func makeButton(for item: Item, pointSize: CGFloat) -> UIButton {
        let button = UIButton(type: .system)
        let config = UIImage.SymbolConfiguration(
            pointSize: pointSize, weight: .medium)
        // SF Symbols can vary with the OS running an OTA-updated web bundle.
        // Never leave a tab as an unlabeled empty target when a newer symbol
        // name reaches an older shell.
        let image = UIImage(systemName: item.symbol, withConfiguration: config)
            ?? UIImage(systemName: "sparkles", withConfiguration: config)
        button.setImage(image, for: .normal)
        button.tintColor = iconTint(active: false)
        // The pill divides the room it has; a button that insists on its
        // intrinsic width would break the layout instead of getting narrower.
        button.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        button.accessibilityLabel = item.label
        button.accessibilityIdentifier = "native-tab-\(item.id)"
        button.addAction(
            UIAction { [weak self] _ in self?.didTap(item.id) }, for: .touchUpInside)
        return button
    }

    // ── behaviour ─────────────────────────────────────────────────────────────

    private func didTap(_ id: String) {
        applySelection(id, animated: true)
        notifyListeners("tabSelected", data: ["id": id])
    }

    private func applySelection(_ id: String, animated: Bool) {
        selectedId = id
        for (item, button) in buttons {
            button.tintColor = iconTint(active: item.id == id)
            button.accessibilityTraits = item.id == id ? [.button, .selected] : [.button]
            button.backgroundColor = item.id == id ? chipColor : .clear
        }
        toggleButton?.setImage(UIImage(systemName: items.first { $0.id == id }?.symbol ?? "line.3.horizontal", withConfiguration: UIImage.SymbolConfiguration(pointSize: 23, weight: .semibold)), for: .normal)
        setExpanded(false, animated: animated)
    }

    private func applyVisibility(_ next: Bool) {
        visible = next
        if !next { setExpanded(false) }
        self.container?.isHidden = !next
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
