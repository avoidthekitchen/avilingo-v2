import XCTest

final class SmokeTests: XCTestCase {
    private let bundleIdentifier = "com.unformedideas.beakspeak"

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    override func tearDownWithError() throws {
        let capture = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        capture.name = "Simulator smoke final screen"
        capture.lifetime = .keepAlways
        add(capture)
    }

    private func launchInstalledApp() -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: bundleIdentifier)
        app.launch()
        XCTAssertTrue(app.staticTexts["Learn Birds"].waitForExistence(timeout: 20), app.debugDescription)
        return app
    }

    private func button(_ app: XCUIApplication, containing text: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    private func introducedSpeciesCount(_ app: XCUIApplication) -> String? {
        let summary = app.staticTexts
            .matching(NSPredicate(format: "label CONTAINS %@", "birds introduced"))
            .firstMatch
        guard summary.waitForExistence(timeout: 10) else { return nil }
        return summary.label
    }

    func testBackgroundAndForegroundKeepTheSessionUsable() {
        let app = launchInstalledApp()

        let lesson = button(app, containing: "Lesson 1: The unmistakable three")
        XCTAssertTrue(lesson.waitForExistence(timeout: 5), app.debugDescription)
        lesson.tap()

        let play = app.buttons["Play Song"]
        XCTAssertTrue(play.waitForExistence(timeout: 10), app.debugDescription)
        play.tap()

        XCUIDevice.shared.press(.home)
        app.activate()

        // XCUITest cannot observe whether the clip stopped: the control's accessible name
        // is the same whether or not it is playing. What it can assert is that the session
        // survived the transition and that playback is not wedged afterwards, which is the
        // failure this guards against.
        XCTAssertTrue(app.staticTexts["American Crow"].waitForExistence(timeout: 20), app.debugDescription)
        XCTAssertTrue(play.waitForExistence(timeout: 10), app.debugDescription)
        play.tap()
        XCTAssertTrue(play.isHittable, app.debugDescription)
    }

    func testProgressSurvivesAForceQuit() {
        let app = launchInstalledApp()

        // Skip Ahead is the cheapest way to write progress: it introduces the skipped
        // lessons' species without stepping through a whole lesson. On a container that
        // already holds progress the lesson is unlocked and no dialog appears.
        let lockedLesson = button(app, containing: "Lesson 3:")
        XCTAssertTrue(lockedLesson.waitForExistence(timeout: 5), app.debugDescription)
        lockedLesson.tap()

        let confirm = app.buttons["Skip Ahead Anyway"]
        if confirm.waitForExistence(timeout: 5) {
            confirm.tap()
        }

        let back = button(app, containing: "Back")
        XCTAssertTrue(back.waitForExistence(timeout: 10), app.debugDescription)
        back.tap()

        guard let introduced = introducedSpeciesCount(app) else {
            return XCTFail("Could not read the introduced-species summary. \(app.debugDescription)")
        }
        XCTAssertFalse(
            introduced.hasPrefix("0 "),
            "Skip Ahead recorded no Introduced Species, so this cannot test persistence."
        )

        app.terminate()
        app.launch()
        XCTAssertTrue(app.staticTexts["Learn Birds"].waitForExistence(timeout: 20), app.debugDescription)

        XCTAssertEqual(
            introducedSpeciesCount(app),
            introduced,
            "Introduced Species progress did not survive a force quit."
        )
    }
}
