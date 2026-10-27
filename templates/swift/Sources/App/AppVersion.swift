import Foundation

/// User-facing app identity derived from the bundle's Info.plist.
struct AppVersion: Equatable, CustomStringConvertible {
    let name: String
    let marketing: String
    let build: String

    init(info: [String: Any]) {
        name = info["CFBundleName"] as? String ?? "Unknown"
        marketing = info["CFBundleShortVersionString"] as? String ?? "0.0.0"
        build = info["CFBundleVersion"] as? String ?? "0"
    }

    init(bundle: Bundle) {
        self.init(info: bundle.infoDictionary ?? [:])
    }

    var description: String { "Version \(marketing) (\(build))" }
}
