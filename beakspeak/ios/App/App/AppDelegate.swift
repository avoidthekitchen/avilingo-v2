import UIKit
import Capacitor
import AVFAudio

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    // AVAudioSession calls can block for seconds while the audio server starts, so they
    // are serialized off the main thread. Nothing blocks app launch or activation, and the
    // category only has to be set before the learner's first tap to play.
    private let audioSessionQueue = DispatchQueue(label: "com.unformedideas.beakspeak.audio-session")

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configureAudioSession()
        return true
    }

    // Route bird audio through the media channel so lessons stay audible with the silent switch on.
    // The category persists for the lifetime of the process, so it is set once at launch.
    private func configureAudioSession() {
        audioSessionQueue.async {
            do {
                try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            } catch {
                NSLog("Unable to configure the BeakSpeak audio session: %@", error.localizedDescription)
            }
        }
    }

    private func deactivateAudioSession() {
        audioSessionQueue.async {
            do {
                try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            } catch {
                NSLog("Unable to deactivate the BeakSpeak audio session: %@", error.localizedDescription)
            }
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Let other apps resume their audio; the web layer has already stopped playback.
        deactivateAudioSession()
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // The playback category set at launch survives deactivation, so there is nothing to restore.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
