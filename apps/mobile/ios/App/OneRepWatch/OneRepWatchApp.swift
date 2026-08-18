import SwiftUI

@main
struct OneRepWatchApp: App {
    /// One store for the whole app: `WCSession` has a single delegate, so
    /// letting each screen make its own would mean the last one to appear
    /// silently stole the connection from the others.
    @StateObject private var store = WatchConnectivityStore()

    var body: some Scene {
        WindowGroup {
            TabView {
                NavigationStack { TodayView(store: store) }
                NavigationStack { WorkoutView(store: store) }
            }
            .tabViewStyle(.verticalPage)
        }
    }
}
