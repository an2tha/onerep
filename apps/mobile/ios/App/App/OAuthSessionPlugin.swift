import AuthenticationServices
import Capacitor
import UIKit

/// Runs an OAuth round trip in `ASWebAuthenticationSession`.
///
/// The Capacitor Browser plugin puts the provider in an
/// `SFSafariViewController`, which has no notion of a callback scheme: when
/// Better Auth finishes and redirects to `onerep://auth/sso-callback?ott=...`
/// iOS refuses to follow it out of the browser, so the app's `appUrlOpen`
/// listener never fires and the sheet sits there on a dead page. Apple's own
/// sign-in is the worst of it — `response_mode=form_post` means that redirect
/// follows a POST, which is the case iOS blocks hardest, and the user is left
/// staring at white.
///
/// `ASWebAuthenticationSession` exists for exactly this. Handed the scheme up
/// front, it intercepts the redirect itself and returns the whole URL —
/// one-time token and all — straight to the caller. The web layer then
/// redeems it the same way it always did.
@objc(OAuthSessionPlugin)
public class OAuthSessionPlugin: CAPPlugin, CAPBridgedPlugin,
    ASWebAuthenticationPresentationContextProviding
{
    public let identifier = "OAuthSessionPlugin"
    public let jsName = "OAuthSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]

    /// Held for the life of the sheet. ASWebAuthenticationSession is
    /// deallocated the moment nothing references it, which cancels the flow
    /// before the user has typed anything.
    private var session: ASWebAuthenticationSession?

    @objc func start(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
            let url = URL(string: urlString)
        else {
            call.reject("A url is required")
            return
        }
        guard let scheme = call.getString("callbackScheme"), !scheme.isEmpty else {
            call.reject("A callbackScheme is required")
            return
        }

        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: scheme
            ) { [weak self] callbackURL, error in
                self?.session = nil

                if let error = error as? ASWebAuthenticationSessionError,
                    error.code == .canceledLogin
                {
                    // Swiping the sheet away is a decision, not a fault. The
                    // web layer shows nothing and leaves the user on login.
                    call.resolve(["cancelled": true])
                    return
                }
                if let error {
                    call.reject(error.localizedDescription)
                    return
                }
                guard let callbackURL else {
                    call.reject("Sign-in finished without a callback URL")
                    return
                }

                call.resolve([
                    "cancelled": false,
                    "url": callbackURL.absoluteString,
                ])
            }

            session.presentationContextProvider = self
            // Without this the sheet reuses Safari's cookie jar, so the
            // provider silently reuses whatever account is already signed in
            // there and "select_account" never gets a chance to ask.
            session.prefersEphemeralWebBrowserSession = true
            self.session = session

            if !session.start() {
                self.session = nil
                call.reject("Could not open the sign-in sheet")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession)
        -> ASPresentationAnchor
    {
        return self.bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
