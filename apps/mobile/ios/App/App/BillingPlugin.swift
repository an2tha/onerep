import Capacitor
import Foundation
import StoreKit

/// StoreKit 2, reduced to the four things the app actually needs: what the
/// products cost, buy one, hand back what was bought, and tell me when
/// something changes while I wasn't looking.
///
/// The plugin deliberately decides nothing. Every path here ends in a JWS —
/// Apple's signed description of a transaction — which is handed to the web
/// layer, posted to Convex, and verified there against Apple's root
/// certificate and the App Store Server API. The device is a courier.
///
/// That is not ceremony. A jailbroken phone can return whatever it likes from
/// `Transaction.currentEntitlements`, and the only part of the payload it
/// cannot forge is the signature. So the signature is the only part we send.
@objc(BillingPlugin)
public class BillingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BillingPlugin"
    public let jsName = "Billing"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise)
    ]

    /// Transactions StoreKit considers unfinished, kept by id so the web layer
    /// can finish one by name once the server has agreed it happened.
    private var pending: [String: Transaction] = [:]
    private let pendingQueue = DispatchQueue(label: "life.onerep.billing.pending")
    private var updatesTask: Task<Void, Never>?

    /// Started at load and never cancelled while the app lives.
    ///
    /// This is the channel Apple uses for everything that does not happen
    /// during a `purchase()` call: a renewal, a refund, an Ask to Buy approval
    /// that arrived while the phone was in a pocket, a purchase made on another
    /// device. Miss it and the app is correct only for people who never leave
    /// the paywall.
    override public func load() {
        updatesTask = Task.detached(priority: .background) { [weak self] in
            for await update in Transaction.updates {
                await self?.handle(update)
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    private func handle(_ result: VerificationResult<Transaction>) async {
        // `unsafePayloadValue` rather than the verified one on purpose: local
        // verification is not what we are relying on, and a payload that fails
        // it still deserves to reach the server, which will refuse it properly.
        let transaction = result.unsafePayloadValue
        remember(transaction)
        notifyListeners(
            "transactionUpdated",
            data: [
                "signedTransaction": result.jwsRepresentation,
                "transactionId": String(transaction.id),
                "productId": transaction.productID
            ]
        )
    }

    private func remember(_ transaction: Transaction) {
        pendingQueue.sync { pending[String(transaction.id)] = transaction }
    }

    private func take(_ transactionId: String) -> Transaction? {
        pendingQueue.sync {
            let transaction = pending[transactionId]
            pending[transactionId] = nil
            return transaction
        }
    }

    // MARK: - Availability

    @objc func isAvailable(_ call: CAPPluginCall) {
        // `AppStore.canMakePayments` is false under parental restrictions, and
        // showing a buy button to someone the device will refuse is worse than
        // showing none.
        call.resolve([
            "available": AppStore.canMakePayments,
            "platform": "ios"
        ])
    }

    // MARK: - Catalogue

    /// Prices come from StoreKit, never from our server.
    ///
    /// `displayPrice` is already localised, already carries the right currency,
    /// and already reflects whatever regional price Apple decided on. A price
    /// label shipped from Convex would be right in one country.
    @objc func getProducts(_ call: CAPPluginCall) {
        let ids = call.getArray("productIds", String.self) ?? []
        guard !ids.isEmpty else {
            call.reject("No product identifiers were given")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: Set(ids))
                call.resolve([
                    "products": products.map { product in
                        var entry: [String: Any] = [
                            "id": product.id,
                            "displayName": product.displayName,
                            "description": product.description,
                            "displayPrice": product.displayPrice
                        ]
                        if let period = product.subscription?.subscriptionPeriod {
                            entry["period"] = Self.periodLabel(period)
                        }
                        return entry
                    }
                ])
            } catch {
                call.reject("Could not load products", nil, error)
            }
        }
    }

    private static func periodLabel(_ period: Product.SubscriptionPeriod) -> String {
        let unit: String
        switch period.unit {
        case .day: unit = "day"
        case .week: unit = "week"
        case .month: unit = "month"
        case .year: unit = "year"
        @unknown default: unit = "period"
        }
        return period.value == 1 ? unit : "\(period.value) \(unit)s"
    }

    // MARK: - Purchase

    /// Buy, and report exactly which of StoreKit's four endings happened.
    ///
    /// `pending` is not a failure: Ask to Buy sends the purchase to a parent
    /// and the answer arrives hours later through `Transaction.updates`. The
    /// app says so rather than pretending the tap did nothing.
    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId is required")
            return
        }

        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("That subscription is not available on this device")
                    return
                }

                var options: Set<Product.PurchaseOption> = []
                // The token binds the purchase to the OneRep account before any
                // money moves, which is what lets the server attribute a
                // renewal years later without the app being involved at all.
                if let raw = call.getString("appAccountToken"),
                   let token = UUID(uuidString: raw) {
                    options.insert(.appAccountToken(token))
                }

                let result = try await product.purchase(options: options)
                switch result {
                case .success(let verification):
                    // Explicit `self` because a Task closure escapes.
                    self.remember(verification.unsafePayloadValue)
                    call.resolve([
                        "status": "purchased",
                        "signedTransaction": verification.jwsRepresentation,
                        "transactionId": String(verification.unsafePayloadValue.id)
                    ])
                case .pending:
                    call.resolve(["status": "pending"])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                @unknown default:
                    call.resolve(["status": "unknown"])
                }
            } catch {
                call.reject("Purchase failed", nil, error)
            }
        }
    }

    // MARK: - Restore

    /// The Restore Purchases button App Review looks for.
    ///
    /// `AppStore.sync()` prompts for the Apple Account password, so it is only
    /// ever called from an explicit tap — never on launch, where it would be an
    /// unprompted password box on a fitness app's first screen.
    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
            } catch {
                // A cancelled password prompt lands here. The entitlements read
                // below still works and is usually enough, so this is not fatal.
            }
            call.resolve(["transactions": await self.entitlementPayloads()])
        }
    }

    /// What this Apple Account currently owns, without prompting for anything.
    @objc func currentEntitlements(_ call: CAPPluginCall) {
        Task {
            call.resolve(["transactions": await self.entitlementPayloads()])
        }
    }

    private func entitlementPayloads() async -> [[String: Any]] {
        var payloads: [[String: Any]] = []
        for await result in Transaction.currentEntitlements {
            let transaction = result.unsafePayloadValue
            remember(transaction)
            payloads.append([
                "signedTransaction": result.jwsRepresentation,
                "transactionId": String(transaction.id),
                "productId": transaction.productID
            ])
        }
        return payloads
    }

    // MARK: - Finishing

    /// Tell StoreKit the goods were delivered.
    ///
    /// Called only after Convex has stored the subscription. Finish earlier and
    /// a failed round trip means a paid transaction nobody is holding — for a
    /// subscription StoreKit would still surface it under
    /// `currentEntitlements`, but relying on that is a way of saying the order
    /// does not matter, and one day it will.
    @objc func finishTransaction(_ call: CAPPluginCall) {
        guard let transactionId = call.getString("transactionId") else {
            call.reject("transactionId is required")
            return
        }
        guard let transaction = take(transactionId) else {
            // Already finished, or from a previous launch. Either way there is
            // nothing left to do and nothing worth failing over.
            call.resolve(["finished": false])
            return
        }
        Task {
            await transaction.finish()
            call.resolve(["finished": true])
        }
    }
}
