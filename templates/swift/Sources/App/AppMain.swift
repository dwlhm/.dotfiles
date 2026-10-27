import SwiftUI

@main
struct AppMain: App {
    #if DISTRIBUTION_DIRECT
    @State private var updater = Updater()
    #endif

    var body: some Scene {
        let group = WindowGroup {
            ContentView(version: AppVersion(bundle: .main))
        }

        #if DISTRIBUTION_DIRECT
        group.commands {
            CommandGroup(after: .appInfo) {
                CheckForUpdatesButton(updater: updater)
            }
        }
        #else
        group
        #endif
    }
}
