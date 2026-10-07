import XCTest

@MainActor
final class OneRepScreenshots: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        setupSnapshot(app)
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 60),
                      "The Capacitor web view did not load. Build and sync the iOS web assets first.")
    }

    func testAuthentication() {
        let welcome = app.webViews.staticTexts["Welcome back"].firstMatch
        XCTAssertTrue(welcome.waitForExistence(timeout: 60),
                      "The app did not reach sign-in. Check that the synced web assets load, use a signed-out simulator, and set the app language to English. Use flow:tabs for a prepared account.")
        snapshot("01-sign-in")

        // WebKit exposes ARIA tabs as buttons on iOS.
        let createAccount = app.webViews.buttons["Create account"].firstMatch
        XCTAssertTrue(createAccount.waitForExistence(timeout: 10))
        createAccount.tap()
        XCTAssertTrue(app.webViews.staticTexts["Create your account"].firstMatch.waitForExistence(timeout: 10))
        snapshot("02-create-account")
    }

    func testMainTabs() {
        let home = app.buttons["native-tab-/"]
        XCTAssertTrue(home.waitForExistence(timeout: 60),
                      "Sign in and finish onboarding on this simulator before running flow:tabs. Use a demo account with representative data and English app language.")
        captureTab("/", name: "01-today", heading: nil)
        captureTab("/nutrition", name: "02-nutrition", heading: "Nutrition")
        captureTab("/workouts", name: "03-training", heading: "Training")
        captureTab("/progress", name: "04-goals", heading: "Goals")
        captureTab("/more", name: "05-more", heading: "More")
    }

    private func captureTab(_ route: String, name: String, heading: String?) {
        let tab = app.buttons["native-tab-\(route)"]
        XCTAssertTrue(tab.waitForExistence(timeout: 10))
        tab.tap()
        if let heading {
            // Restrict to the web view so the native tab label cannot satisfy readiness.
            XCTAssertTrue(app.webViews.staticTexts[heading].firstMatch.waitForExistence(timeout: 30),
                          "The \(heading) page did not become ready.")
        }
        snapshot(name)
    }
}
