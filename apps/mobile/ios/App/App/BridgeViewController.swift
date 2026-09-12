import Capacitor
import Foundation

class BridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(AppleHealthPlugin())
        bridge?.registerPluginInstance(EnduranceLocationPlugin())
        bridge?.registerPluginInstance(WorkoutLiveActivityPlugin())
        bridge?.registerPluginInstance(NativeTabBarPlugin())
        bridge?.registerPluginInstance(OtaTrustPlugin())
        bridge?.registerPluginInstance(OAuthSessionPlugin())
        bridge?.registerPluginInstance(BillingPlugin())
        bridge?.registerPluginInstance(NeedlePlugin())

        // The web app supplies its own controls. Remove Safari's large
        // previous/next/dismiss form accessory bar above the iOS keyboard.
        bridge?.webView?.inputAssistantItem.leadingBarButtonGroups = []
        bridge?.webView?.inputAssistantItem.trailingBarButtonGroups = []
    }
}
