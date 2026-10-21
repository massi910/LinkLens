# Mobile and accessibility checks

Run these checks against the actual plugin in Obsidian. Record the device, OS version, Obsidian version, input method, and each outcome. Desktop narrow-window tests and mobile emulation do not establish compatibility on Android or iOS. A missing device or inaccessible plugin directory means the corresponding check is pending.

## Preparation

From the repository root, with Node.js 22 or newer:

```sh
npm run typecheck
npm test
npm run test:vault
```

Open the printed fresh synthetic vault on desktop. Enable community plugins and LinkLens. The initial scan should show the six results documented in [desktop checks](desktop.md). Never use a private vault or open missing destinations.

The mobile test requires Obsidian 1.7.2 or newer, a disposable mobile vault, and access to its actual configuration directory. Transfer the synthetic Markdown notes, `Assets`, and `.obsidian/plugins/linklens/` into that vault using a transfer method already available to you. The plugin folder must contain `main.js`, `manifest.json`, and `styles.css`. Do not overwrite the entire configuration directory of another vault.

- On Android, use a file manager that can show hidden files and access the test vault's selected storage location. Restart Obsidian after copying the plugin files.
- On iOS/iPadOS, use an existing transfer or sync setup that can copy the actual plugin configuration folder. Merely placing a ZIP or the three assets among the notes does not install the plugin. If the hidden plugin directory is inaccessible with your current setup, report installation as pending; do not install extra services or assume the plugin has been tested.

Enable community plugins and LinkLens on the device. A desktop copy alone does not establish mobile enablement. In Obsidian mobile, open the command palette using its toolbar or command-palette control and choose **LinkLens: Scan vault for broken links**.

## Layout, themes and touch

1. Scan the fresh fixture on the phone or tablet: expect the same six results and ordering as desktop.
2. Inspect portrait and landscape orientations. Source paths, targets, original links and positions must wrap without overlapping or pushing controls off screen. Scroll to the final result.
3. Switch Obsidian's base color scheme between light and dark in **Settings → Appearance**. Check readable text, borders and enabled/disabled controls in both. Community themes are not required.
4. Increase the app's available text/font size setting. Check that rows and buttons remain readable without clipping.
5. Tap **Open source** for the second repeated Missing occurrence: the normal editor must select the intended link. The on-screen keyboard must not hide the selection permanently; scroll if necessary. Return to LinkLens.
6. Correct one occurrence manually, wait for indexing and tap **Scan vault**: the count decreases by one. The new results must not be mixed with the old list.
7. Close the LinkLens tab, reopen via the command, then disable/re-enable the plugin. Confirm scanning still works and the plugin never rewrites notes by itself.

## Desktop narrow pane and keyboard

1. Split the desktop workspace and make only the LinkLens pane narrow while the application window stays wide. Fields should use one column when the pane is narrow; long text must wrap.
2. Use Tab/Shift+Tab to reach **Scan vault**, **Open source**, and pagination controls when present. Focus must be visible and follow document order. Native buttons must activate with Enter or Space.
3. Focus **Scan vault** and start a scan using the keyboard. On completion, focus should remain on that button or return to it if disabling it temporarily moved focus to the document body.
4. While a scan is pending, move to another control or another application. Its focus must not be stolen when the scan completes. If the fixture finishes too quickly to observe this, mark the manual timing check pending; automated tests cover the controlled case.
5. Follow the pagination fixture steps from the desktop workflow if needed: create over 100 missing occurrences, navigate forward/back by keyboard, and confirm visible focus remains on an enabled pagination button.

## Assistive technology

With VoiceOver, TalkBack, or another available screen reader:

1. Open the LinkLens view and find its heading, **Scan vault**, result count and ordered list.
2. Confirm each row exposes source, target, original link, position and type. **Open source** must announce which source/position it opens, not just a repeated generic button name.
3. Start a scan. The status region is updated in place and should announce the completed result without requiring navigation back to it. Exact announcement timing depends on the screen reader.
4. Check errors only when one genuinely occurs; do not manipulate undocumented Obsidian internals. Retry must restore ordinary status semantics. Automated tests cover this transition.

If no screen reader or external keyboard is available, record those checks as pending instead of treating touch success as equivalent.

Report automatic test results and the individual desktop, Android, iOS/iPadOS, theme, touch, keyboard and screen-reader outcomes. A passing result on one mobile platform does not establish the other.
