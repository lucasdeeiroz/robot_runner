# Mapper (Autonomous Exploration)

The Mapper tab houses the Autonomous Graph Exploration Engine, designed to build a digital twin of your application.

### Key Features

- **Autonomous DFS Exploration:** The bot takes control of your device, clicking every unvisited button to map out all possible navigation routes in the app.
- **Graph Visualization:** Relationships between screens (Vertices and Edges) are visualized, allowing you to see how deep your app navigation goes.
- **Element Harvesting:** Every screen visited is dumped into a `JSON` file containing all interactive elements, making it an automated locators dictionary.
- **Resilience:** The state is saved incrementally. If the app crashes, the explorer can be paused, the app restarted, and the explorer will resume where it left off.

### How to Use
1. Start the app on your device.
2. In the Mapper Tab, click 'Start Exploration'.
3. Watch as the bot navigates the app, populating the nodes graph in real-time.
4. Click 'Export JSON' when satisfied with the mapping.
