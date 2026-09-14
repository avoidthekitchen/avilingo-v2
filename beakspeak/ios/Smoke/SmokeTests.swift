import XCTest

final class SmokeTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    override func tearDownWithError() throws {
        let capture = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        capture.name = "Simulator smoke final screen"
        capture.lifetime = .keepAlways
        add(capture)
    }

    func testPackagedAppNavigation() {
        let app = XCUIApplication(bundleIdentifier: "com.unformedideas.beakspeak.feasibility")
        app.launch()
        XCTAssertTrue(app.staticTexts["Learn Birds"].waitForExistence(timeout: 20), app.debugDescription)
        let lesson = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Lesson 1: The unmistakable three")).firstMatch
        XCTAssertTrue(lesson.waitForExistence(timeout: 5), app.debugDescription)
        lesson.tap()
        XCTAssertTrue(app.staticTexts["American Crow"].waitForExistence(timeout: 10), app.debugDescription)
    }
}
