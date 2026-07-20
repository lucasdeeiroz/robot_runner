# Inspector

The Inspector tab is the most powerful UI interaction tool in Robot Runner. It combines real-time screen mirroring with XML hierarchy dumping to help you build solid automation locators.

### Key Features

- **Live Screen Mirroring:** Powered by Scrcpy, interact with your device (click, scroll, swipe) directly from your computer with ultra-low latency.
- **UI Element Tree:** Capture the XML dump of the current screen to visualize the exact hierarchy of nodes.
- **Smart AI Selectors:** When you click an element on the screen, AI analyzes the node and suggests the most resilient locator (preferring Accessibility IDs over complex XPaths).
- **Action Recording (Macro):** Toggle the 'Record' button. Every tap or text input you make on the mirrored screen is recorded as a generic action, which can later be sent to the AI Generator to become Robot Framework code.

### How to Use
1. Select a device and open the Inspector tab.
2. Click the 'Capture Screen' button to pull the latest XML dump and overlay the interactive bounds.
3. Hover over elements to highlight them. Click an element to view its attributes (text, description, class) and copy the suggested XPath or UiSelector.
