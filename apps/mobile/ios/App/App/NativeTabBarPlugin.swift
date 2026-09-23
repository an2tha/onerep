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

/// A single navigation button anchored left, with an animated destination menu.
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
    private var highlight: UIView?
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
            container.leadingAnchor.constraint(equalTo: host.leadingAnchor, constant: 16),
            container.widthAnchor.constraint(equalToConstant: 232),
            container.bottomAnchor.constraint(equalTo: host.safeAreaLayoutGuide.bottomAnchor, constant: -8),
            container.heightAnchor.constraint(equalToConstant: CGFloat(items.count) * 48 + 84)
        ])
        self.container = container
        let pill = UIVisualEffectView(effect: glassEffect())
        pill.translatesAutoresizingMaskIntoConstraints = false
        pill.layer.cornerRadius = 24
        pill.clipsToBounds = true
        container.addSubview(pill)
        self.pill = pill
        let stack = UIStackView()
        stack.axis = .vertical
        stack.distribution = .fillEqually
        stack.translatesAutoresizingMaskIntoConstraints = false
        pill.contentView.addSubview(stack)
        for item in items {
            let button = makeButton(for: item, pointSize: 20)
            button.setTitle("  " + item.label, for: .normal)
            button.setTitleColor(.label, for: .normal)
            button.titleLabel?.font = .systemFont(ofSize: 16, weight: .medium)
            button.contentHorizontalAlignment = .leading
            button.contentEdgeInsets = UIEdgeInsets(top: 0, left: 18, bottom: 0, right: 12)
            stack.addArrangedSubview(button)
            buttons.append((item, button))
        }
        let orb = UIVisualEffectView(effect: glassEffect())
        orb.translatesAutoresizingMaskIntoConstraints = false
        orb.layer.cornerRadius = 30
        orb.clipsToBounds = true
        container.addSubview(orb)
        let toggle = UIButton(type: .system)
        toggle.translatesAutoresizingMaskIntoConstraints = false
        toggle.tintColor = .label
        toggle.addAction(UIAction { [weak self] _ in self?.setExpanded(!(self?.expanded ?? false)) }, for: .touchUpInside)
        orb.contentView.addSubview(toggle)
        toggleButton = toggle
        NSLayoutConstraint.activate([
            orb.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            orb.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            orb.widthAnchor.constraint(equalToConstant: 60),
            orb.heightAnchor.constraint(equalToConstant: 60),
            pill.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            pill.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            pill.bottomAnchor.constraint(equalTo: orb.topAnchor, constant: -12),
            pill.heightAnchor.constraint(equalToConstant: CGFloat(items.count) * 48 + 12),
            stack.leadingAnchor.constraint(equalTo: pill.contentView.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: pill.contentView.trailingAnchor),
            stack.topAnchor.constraint(equalTo: pill.contentView.topAnchor, constant: 6),
            stack.bottomAnchor.constraint(equalTo: pill.contentView.bottomAnchor, constant: -6),
            toggle.leadingAnchor.constraint(equalTo: orb.contentView.leadingAnchor),
            toggle.trailingAnchor.constraint(equalTo: orb.contentView.trailingAnchor),
            toggle.topAnchor.constraint(equalTo: orb.contentView.topAnchor),
            toggle.bottomAnchor.constraint(equalTo: orb.contentView.bottomAnchor)
        ])
        pill.alpha = 0
        pill.isHidden = true
        container.isHidden = !visible
        applySelection(selectedId, animated: false)
    }

    private func setExpanded(_ next: Bool) {
        expanded = next
        guard let pill else { return }
        if next { pill.isHidden = false }
        pill.isUserInteractionEnabled = next
        pill.accessibilityElementsHidden = !next
        toggleButton?.accessibilityLabel = next ? "Close navigation" : "Open navigation"
        toggleButton?.setImage(UIImage(systemName: next ? "xmark" : (items.first { $0.id == selectedId }?.symbol ?? "line.3.horizontal")), for: .normal)
        UIView.animate(withDuration: UIAccessibility.isReduceMotionEnabled ? 0 : 0.28, delay: 0, options: [.beginFromCurrentState, .curveEaseInOut]) {
            pill.alpha = next ? 1 : 0
            pill.transform = next ? .identity : CGAffineTransform(translationX: 0, y: 12)
        } completion: { [weak self] _ in
            pill.isHidden = !(self?.expanded ?? false)
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
        setExpanded(false)
        applySelection(id, animated: true)
        notifyListeners("tabSelected", data: ["id": id])
    }

    private func applySelection(_ id: String, animated: Bool) {
        selectedId = id
        for (item, button) in buttons {
            button.tintColor = iconTint(active: item.id == id)
            button.accessibilityTraits = item.id == id ? [.button, .selected] : [.button]
        }
        setExpanded(false)
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
