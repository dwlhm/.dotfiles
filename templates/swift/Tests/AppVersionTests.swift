import Testing

@testable import __APP_NAME__

struct AppVersionTests {
    @Test func readsIdentityFromInfoDictionary() {
        let version = AppVersion(info: [
            "CFBundleName": "Demo",
            "CFBundleShortVersionString": "1.2.3",
            "CFBundleVersion": "42",
        ])

        #expect(version.name == "Demo")
        #expect(version.description == "Version 1.2.3 (42)")
    }

    @Test func fallsBackWhenKeysAreMissing() {
        let version = AppVersion(info: [:])

        #expect(version == AppVersion(info: ["CFBundleName": "Unknown"]))
        #expect(version.description == "Version 0.0.0 (0)")
    }

    @Test func hostBundleCarriesMarketingVersion() {
        let version = AppVersion(bundle: .main)

        #expect(!version.marketing.isEmpty)
    }
}
