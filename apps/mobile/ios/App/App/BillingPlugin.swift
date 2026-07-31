import Capacitor
import Foundation
import StoreKit

/// Thin StoreKit 2 bridge.
///
/// Deliberately does **not** decide entitlement. `purchase` and `getPurchases`
/// return the signed JWS representation of each transaction; the server
/// validates it against Apple and owns the resulting state. The app only
/// finishes a transaction once the server has accepted it, so a crash or a
/// hostile client can never grant itself Pro.
@available(iOS 15.0, *)
@objc(BillingPlugin)
public class BillingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BillingPlugin"
    public let jsName = "Billing"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openManagementUrl", returnType: CAPPluginReturnPromise)
    ]

    private var updatesTask: Task<Void, Never>?

    override public func load() {
        // Renewals, refunds, and Ask-to-Buy approvals arrive here rather than
        // through `purchase`. Forward them so the app can redeem them server
        // side; without this, an offline renewal is never reported.
        updatesTask = Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                if case .verified(let transaction) = result {
                    self.notifyListeners(
                        "purchasesUpdated",
                        data: ["purchases": [self.describe(transaction, jws: result.jwsRepresentation)]]
                    )
                }
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        guard let productIds = call.getArray("productIds", String.self), !productIds.isEmpty else {
            call.reject("productIds is required")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: productIds)
                call.resolve([
                    "products": products.map { product in
                        [
                            "id": product.id,
                            "title": product.displayName,
                            "description": product.description,
                            "displayPrice": product.displayPrice,
                            "priceMicros": NSDecimalNumber(decimal: product.price * 1_000_000).int64Value,
                            "currency": product.priceFormatStyle.currencyCode
                        ]
                    }
                ])
            } catch {
                call.reject(error.localizedDescription, nil, error)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId is required")
            return
        }

        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("Product \(productId) is not available")
                    return
                }

                var options: Set<Product.PurchaseOption> = []
                // Carries the OneRep user id into Apple's records so a server
                // notification for a purchase we never saw can still be
                // attributed. Apple requires a UUID here.
                if let token = call.getString("appAccountToken"), let uuid = UUID(uuidString: token) {
                    options.insert(.appAccountToken(uuid))
                }

                let result = try await product.purchase(options: options)
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        // Note: intentionally NOT calling `transaction.finish()`
                        // here. The JS layer finishes it only after the server
                        // has validated and recorded the purchase.
                        call.resolve([
                            "status": "purchased",
                            "purchase": describe(transaction, jws: verification.jwsRepresentation)
                        ])
                    case .unverified(_, let error):
                        call.reject("Apple could not verify the purchase: \(error.localizedDescription)")
                    }
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                case .pending:
                    // Ask-to-Buy and SCA land here; `Transaction.updates`
                    // delivers the result later.
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.resolve(["status": "unknown"])
                }
            } catch {
                call.reject(error.localizedDescription, nil, error)
            }
        }
    }

    @objc func getPurchases(_ call: CAPPluginCall) {
        Task {
            var purchases: [[String: Any]] = []
            for await result in Transaction.currentEntitlements {
                if case .verified(let transaction) = result {
                    purchases.append(describe(transaction, jws: result.jwsRepresentation))
                }
            }
            call.resolve(["purchases": purchases])
        }
    }

    @objc func finishTransaction(_ call: CAPPluginCall) {
        guard let rawId = call.getString("transactionId"), let transactionId = UInt64(rawId) else {
            call.reject("transactionId is required")
            return
        }

        Task {
            for await result in Transaction.unfinished {
                if case .verified(let transaction) = result, transaction.id == transactionId {
                    await transaction.finish()
                    call.resolve(["finished": true])
                    return
                }
            }
            // Already finished; treat as success so retries are idempotent.
            call.resolve(["finished": true])
        }
    }

    @objc func openManagementUrl(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene else {
                call.reject("No active window scene")
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve(["opened": true])
            } catch {
                call.reject(error.localizedDescription, nil, error)
            }
        }
    }

    private func describe(_ transaction: Transaction, jws: String) -> [String: Any] {
        var payload: [String: Any] = [
            "transactionId": String(transaction.id),
            "originalTransactionId": String(transaction.originalID),
            "productId": transaction.productID,
            // The server treats this as the only trustworthy field: everything
            // else here is for display and logging.
            "receipt": jws
        ]
        if let expires = transaction.expirationDate {
            payload["expiresAt"] = expires.timeIntervalSince1970 * 1000
        }
        return payload
    }
}
