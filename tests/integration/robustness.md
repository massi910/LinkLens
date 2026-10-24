# Robustness and regression checks

Use a disposable synthetic vault, never a private vault. Record Obsidian version, OS, device, scan duration, observed responsiveness, and exact counts. Automated mock tests establish orchestration behavior; they do not measure real Obsidian indexing, rendering, memory consumption, or mobile performance.

## Prepare the larger fixture

From the repository root with Node.js 22 or newer:

```sh
npm run typecheck
npm test
npm run test:vault -- --large
```

The last command creates a new temporary vault with the plugin assets already installed. It does not modify an existing vault. The fixture contains:

- The original seven-note desktop matrix and one PNG attachment.
- 1,000 additional notes in ten nested Stress folders, each with nine valid Target links and one missing link on line 10.
- `Stress/Many links.md` with 20,000 valid Target links.

Total: **1,008 Markdown notes and 1,006 missing occurrences**. There are **30,000 links in the additional stress notes**. The original fixture contributes six missing occurrences. The large valid-link note must not appear among results.

Open the printed folder as a vault in Obsidian and enable LinkLens. Wait for Obsidian to finish initial indexing before establishing the baseline. If metadata is temporarily unavailable, the plugin must show an explicit error rather than a completed partial result; retry after indexing. Do not manipulate private APIs to manufacture cache failures.

## Repeated scans, ordering and responsiveness

1. Run **LinkLens: Scan vault for broken links** three times, allowing each scan to finish. Expect **1,006** each time, without accumulated duplicates.
2. Record approximate time to completion. While scanning, try scrolling or switching tabs. Report freezes or input delays; do not infer responsiveness from fast mocked tests. No universal timing threshold is asserted.
3. Expect 100 results on the first page and six on the eleventh page. First results are the four Cases occurrences, followed by One/Source. The last result is Two/Source. Stress notes appear in sorted group/note order, with their missing occurrence on line 10.
4. Open a Stress result: the correct source and line 10 must be selected. `Stress/Many links.md` should produce no missing results.

## Edits during a scan and recovery

1. Keep a Stress note open beside LinkLens. Start a scan and insert a line in that note while Scanning is still visible. If the source change is registered during the scan, expect an error asking for a fresh scan, with no partial result list.
2. Wait for saving/indexing and rescan. Count remains **1,006**, but that occurrence's line moves from 10 to 11.
3. If the scan finishes before the edit is saved/registered, record the concurrent-edit observation as pending and repeat if practical. That sequence does not establish a failure of change detection. Automated tests cover a controlled edit between batches.
4. Remove the missing link from one Stress note manually. After indexing, rescan: expect **1,005**. Repeat the scan to confirm the count stays **1,005**.

## Cancellation and lifecycle

1. Start a scan, close LinkLens while work is still pending, and immediately run the command again. Expect a working fresh view and no late updates to the old view.
2. Start another scan and disable LinkLens. Its view must close with no late failure notice. Re-enable and scan: expected count is unchanged by cancellation.
3. Record timing cases as pending if the scan completes before the close/disable action. Do not count a post-completion close as cancellation during work.

## Empty state without changing the source notes

1. Create `Stress missing.md` at the vault root with any plain text. This supplies the missing destination shared by all 1,000 Stress notes. Wait for indexing and scan: only the six original missing occurrences should remain, unless one original source was manually changed.
2. Correct/remove the original six missing occurrences using Open source and normal manual editing. Wait and rescan: expect **No broken internal file links found**, with no residual list or pagination.
3. Scan the empty result twice more. Keep the source notes and image; the result must stay empty.

If available, repeat on a mobile device using the transfer instructions in [mobile and accessibility checks](mobile-accessibility.md). A desktop pass does not establish mobile performance. Report metadata recovery, concurrent edits, cancellation and mobile results separately, including any checks that could not be observed.
