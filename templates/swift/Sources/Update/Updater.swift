#if DISTRIBUTION_DIRECT
import Sparkle
import SwiftUI

/// Sparkle auto-updater for the Direct (Developer ID) channel.
/// Stays inert until `SPARKLE_PUBLIC_ED_KEY` is configured, so dev builds never prompt.
@MainActor
@Observable
final class Updater {
    private let controller: SPUStandardUpdaterController
    private(set) var canCheckForUpdates = false
    private var observation: NSKeyValueObservation?

    init(bundle: Bundle = .main) {
        let publicKey = bundle.object(forInfoDictionaryKey: "SUPublicEDKey") as? String ?? ""
        controller = SPUStandardUpdaterController(
            startingUpdater: !publicKey.isEmpty,
            updaterDelegate: nil,
            userDriverDelegate: nil
        )
        observation = controller.updater.observe(
            \.canCheckForUpdates,
            options: [.initial, .new]
        ) { [weak self] updater, _ in
            let canCheck = updater.canCheckForUpdates
            MainActor.assumeIsolated { self?.canCheckForUpdates = canCheck }
        }
    }

    func checkForUpdates() {
        controller.checkForUpdates(nil)
    }
}

struct CheckForUpdatesButton: View {
    let updater: Updater

    var body: some View {
        Button("Check for Updates…") { updater.checkForUpdates() }
            .disabled(!updater.canCheckForUpdates)
    }
}
#endif
