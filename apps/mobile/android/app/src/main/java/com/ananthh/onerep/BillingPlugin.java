package com.ananthh.onerep;

import androidx.annotation.NonNull;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/**
 * Thin Google Play Billing bridge.
 *
 * Mirrors the iOS plugin: it never decides entitlement. `purchase` and
 * `getPurchases` hand back the raw purchase token, which the server validates
 * against the Play Developer API. Acknowledgement also happens server-side —
 * Play auto-refunds anything unacknowledged after three days, and the client is
 * not a reliable place to guarantee that.
 */
@CapacitorPlugin(name = "Billing")
public class BillingPlugin extends Plugin {

    private BillingClient billingClient;
    private final List<PluginCall> pendingPurchaseCalls = new ArrayList<>();

    private final PurchasesUpdatedListener purchasesUpdatedListener = (billingResult, purchases) -> {
        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            resolvePendingPurchases("cancelled", null);
            return;
        }
        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null) {
            rejectPendingPurchases(billingResult.getDebugMessage());
            return;
        }

        JSArray described = describePurchases(purchases);
        // Renewals and deferred approvals arrive here without a pending call.
        JSObject event = new JSObject();
        event.put("purchases", described);
        notifyListeners("purchasesUpdated", event);
        resolvePendingPurchases("purchased", described);
    };

    @Override
    public void load() {
        billingClient = BillingClient
            .newBuilder(getContext())
            .setListener(purchasesUpdatedListener)
            .enablePendingPurchases()
            .build();
    }

    @Override
    protected void handleOnDestroy() {
        if (billingClient != null) {
            billingClient.endConnection();
        }
    }

    /** Play requires an established connection before every operation. */
    private void withConnection(PluginCall call, Runnable action) {
        if (billingClient.isReady()) {
            action.run();
            return;
        }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    action.run();
                } else {
                    call.reject("Play Billing unavailable: " + billingResult.getDebugMessage());
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                // Reconnection is attempted lazily on the next call.
            }
        });
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        JSArray productIds = call.getArray("productIds");
        if (productIds == null || productIds.length() == 0) {
            call.reject("productIds is required");
            return;
        }

        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        for (int index = 0; index < productIds.length(); index++) {
            try {
                products.add(
                    QueryProductDetailsParams.Product
                        .newBuilder()
                        .setProductId(productIds.getString(index))
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build()
                );
            } catch (org.json.JSONException error) {
                call.reject("productIds must be strings");
                return;
            }
        }

        withConnection(call, () ->
            billingClient.queryProductDetailsAsync(
                QueryProductDetailsParams.newBuilder().setProductList(products).build(),
                (billingResult, productDetailsList) -> {
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        call.reject(billingResult.getDebugMessage());
                        return;
                    }
                    JSArray result = new JSArray();
                    for (ProductDetails details : productDetailsList) {
                        List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
                        if (offers == null || offers.isEmpty()) continue;
                        ProductDetails.PricingPhase phase = offers
                            .get(0)
                            .getPricingPhases()
                            .getPricingPhaseList()
                            .get(0);

                        JSObject product = new JSObject();
                        product.put("id", details.getProductId());
                        product.put("title", details.getTitle());
                        product.put("description", details.getDescription());
                        product.put("displayPrice", phase.getFormattedPrice());
                        product.put("priceMicros", phase.getPriceAmountMicros());
                        product.put("currency", phase.getPriceCurrencyCode());
                        product.put("offerToken", offers.get(0).getOfferToken());
                        result.put(product);
                    }
                    JSObject response = new JSObject();
                    response.put("products", result);
                    call.resolve(response);
                }
            )
        );
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null) {
            call.reject("productId is required");
            return;
        }

        QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product
            .newBuilder()
            .setProductId(productId)
            .setProductType(BillingClient.ProductType.SUBS)
            .build();

        withConnection(call, () ->
            billingClient.queryProductDetailsAsync(
                QueryProductDetailsParams.newBuilder().setProductList(List.of(product)).build(),
                (billingResult, productDetailsList) -> {
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK
                        || productDetailsList.isEmpty()) {
                        call.reject("Product " + productId + " is not available");
                        return;
                    }

                    ProductDetails details = productDetailsList.get(0);
                    List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
                    if (offers == null || offers.isEmpty()) {
                        call.reject("Product " + productId + " has no subscription offers");
                        return;
                    }

                    BillingFlowParams.Builder flow = BillingFlowParams
                        .newBuilder()
                        .setProductDetailsParamsList(
                            List.of(
                                BillingFlowParams.ProductDetailsParams
                                    .newBuilder()
                                    .setProductDetails(details)
                                    .setOfferToken(offers.get(0).getOfferToken())
                                    .build()
                            )
                        );

                    // Carries the OneRep user id into Play's records so an RTDN
                    // for a purchase we never saw can still be attributed.
                    String accountToken = call.getString("appAccountToken");
                    if (accountToken != null) {
                        flow.setObfuscatedAccountId(accountToken);
                    }

                    call.setKeepAlive(true);
                    synchronized (pendingPurchaseCalls) {
                        pendingPurchaseCalls.add(call);
                    }

                    BillingResult launch = billingClient.launchBillingFlow(getActivity(), flow.build());
                    if (launch.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        rejectPendingPurchases(launch.getDebugMessage());
                    }
                }
            )
        );
    }

    @PluginMethod
    public void getPurchases(PluginCall call) {
        withConnection(call, () ->
            billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
                (billingResult, purchases) -> {
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        call.reject(billingResult.getDebugMessage());
                        return;
                    }
                    JSObject response = new JSObject();
                    response.put("purchases", describePurchases(purchases));
                    call.resolve(response);
                }
            )
        );
    }

    /**
     * Acknowledge locally as a fallback only.
     *
     * The server acknowledges during validation; this exists so a purchase can
     * still be rescued if the server path failed and the three-day auto-refund
     * window is closing.
     */
    @PluginMethod
    public void finishTransaction(PluginCall call) {
        String token = call.getString("transactionId");
        if (token == null) {
            call.reject("transactionId is required");
            return;
        }

        withConnection(call, () ->
            billingClient.acknowledgePurchase(
                AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build(),
                billingResult -> {
                    JSObject response = new JSObject();
                    response.put(
                        "finished",
                        billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK
                    );
                    call.resolve(response);
                }
            )
        );
    }

    @PluginMethod
    public void openManagementUrl(PluginCall call) {
        String productId = call.getString("productId");
        String url = productId == null
            ? "https://play.google.com/store/account/subscriptions"
            : "https://play.google.com/store/account/subscriptions?sku="
                + productId
                + "&package="
                + getContext().getPackageName();

        getContext().startActivity(
            new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))
                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        );
        JSObject response = new JSObject();
        response.put("opened", true);
        call.resolve(response);
    }

    private JSArray describePurchases(List<Purchase> purchases) {
        JSArray result = new JSArray();
        for (Purchase purchase : purchases) {
            if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
            JSObject item = new JSObject();
            // The purchase token is both the identity and the thing the server
            // validates; everything else is for display and logging.
            item.put("receipt", purchase.getPurchaseToken());
            item.put("transactionId", purchase.getPurchaseToken());
            item.put("orderId", purchase.getOrderId());
            item.put("acknowledged", purchase.isAcknowledged());
            if (!purchase.getProducts().isEmpty()) {
                item.put("productId", purchase.getProducts().get(0));
            }
            result.put(item);
        }
        return result;
    }

    private void resolvePendingPurchases(String status, JSArray purchases) {
        synchronized (pendingPurchaseCalls) {
            for (PluginCall call : pendingPurchaseCalls) {
                JSObject response = new JSObject();
                response.put("status", status);
                if (purchases != null && purchases.length() > 0) {
                    try {
                        response.put("purchase", purchases.getJSONObject(0));
                    } catch (org.json.JSONException ignored) {
                        // Fall through with just the status.
                    }
                }
                call.resolve(response);
                call.setKeepAlive(false);
            }
            pendingPurchaseCalls.clear();
        }
    }

    private void rejectPendingPurchases(String message) {
        synchronized (pendingPurchaseCalls) {
            for (PluginCall call : pendingPurchaseCalls) {
                call.reject(message);
                call.setKeepAlive(false);
            }
            pendingPurchaseCalls.clear();
        }
    }
}
