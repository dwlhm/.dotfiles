import SwiftUI

struct ContentView: View {
    let version: AppVersion

    var body: some View {
        VStack(spacing: 8) {
            Text(version.name)
                .font(.title)
            Text(version.description)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(32)
        .frame(minWidth: 320, minHeight: 200)
    }
}
