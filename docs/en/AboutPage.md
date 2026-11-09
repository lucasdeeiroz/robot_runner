# About Page

Provides metadata regarding the current build, licensing, and update mechanisms for Robot Runner.

### Key Features

- **Version Control:** Displays the current semantic version of the installed client.
- **Update Channel Configuration:** Select between `stable`, `beta`, or `alpha` update channels to receive early-access features.
- **OTA Updates:** Click the check for updates button to trigger the built-in Tauri updater, avoiding the need to manually download new releases.
- **Architecture Info:** Lists the underlying open-source technologies (Rust, Tauri, React, Tailwind) powering the tool.

### Update Integrity (Portable Builds)
When updating the **portable** version, Robot Runner verifies the download before replacing the executable:
1. The update file is downloaded from the GitHub release.
2. The app downloads `SHA256SUMS.txt` from the **same release** and computes the SHA-256 of the downloaded file.
3. The executable is replaced **only** if the hashes match. Only plain release file names (`Robot.Runner_*`) are accepted; any other asset name is rejected.
4. If `SHA256SUMS.txt` is missing, has no entry for the file, or the hash does not match, the update is **refused**, the downloaded file is deleted and you are asked to download the new version manually from the GitHub **Releases** page.

### How to Use
Click the Info icon in the bottom left corner to access. Use this page to force a manual update check if you suspect a new version has been published to GitHub Releases.
