import UIKit
import Capacitor
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.backgroundColor = UIColor(red: 250.0 / 255, green: 248.0 / 255, blue: 245.0 / 255, alpha: 1)
        window?.overrideUserInterfaceStyle = .light
        window?.rootViewController = BeakSpeakViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}


// Keep the shared UI independent of UIKit; only its text-scale token crosses the
// native boundary. Layout spacing and image dimensions retain their base units.
class BeakSpeakViewController: CAPBridgeViewController {
    private var textScaleScript: WKUserScript?
    private var textObservers: [NSObjectProtocol] = []

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        refreshTextScale()
        for name in [UIContentSizeCategory.didChangeNotification, UIApplication.didBecomeActiveNotification] {
            textObservers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.refreshTextScale()
            })
        }
    }

    deinit {
        for observer in textObservers { NotificationCenter.default.removeObserver(observer) }
    }

    private func refreshTextScale() {
        guard let webView = webView else { return }
        let scale = UIFontMetrics(forTextStyle: .body).scaledValue(for: 16) / 16
        let source = "if (document.documentElement) { document.documentElement.style.setProperty('--app-text-scale', '\(scale)'); }"
        let controller = webView.configuration.userContentController
        // WebKit cannot remove one script. Preserve all other script instances and
        // their order, replacing only ours so reloads also use the current setting.
        let others = controller.userScripts.filter { $0 !== textScaleScript }
        controller.removeAllUserScripts()
        for script in others { controller.addUserScript(script) }
        let script = WKUserScript(source: source, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        textScaleScript = script
        controller.addUserScript(script)
        webView.evaluateJavaScript(source, completionHandler: nil)
    }
}
