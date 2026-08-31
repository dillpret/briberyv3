# Frontend verification

For any frontend layout or behavior change, use the repo-owned verification harness from
`src/frontend/bribery-game-client`:

- `npm run inspect:ui` builds an isolated production-shaped app, checks the landing page at desktop and mobile viewports, and writes screenshots plus DOM/error metrics to `output/playwright/ui-verification/`.
- `npm run verify:ui` does the same inspection and then drives a real four-player game through lobby, prompts, bribes, voting, results, and round two. It captures representative dynamic states.

Prefer these commands over manually starting `ng serve`, the API, or a background shell process. The harness uses a temporary staging directory and an OS-assigned loopback port, waits for a successful HTML response, and owns cleanup in `finally`, so it neither depends on nor kills existing developer servers. Its child-process guardian also terminates the exact build/server child if the harness owner disappears unexpectedly. Run it from the frontend directory and allow enough time for both builds.

After `inspect:ui` or `verify:ui`, visually open the relevant viewport and full-page PNGs; a passing command alone is not visual verification. Use viewport images for fixed/sticky overlap and full-page images for hierarchy and scroll burden. Read `inspection-report.json` for browser errors, horizontal overflow, dimensions, headings, and button text.

When a changed UI state is not covered, extend the browser flow with role/label/placeholder locators and add a screenshot at that state. Do not bypass the real backend with mocked routes for integration verification. Keep browser contexts isolated per player, re-query locators after navigation, and treat console errors, page errors, failed requests, HTTP 4xx/5xx responses, and unexpected horizontal overflow as failures.

Do not leave app or browser processes running for later commands. Do not kill processes by broad name or fixed port. If a verification command is interrupted, rerun it normally; child processes are owner-guarded, and the next run scavenges abandoned process-scoped staging directories only after confirming their recorded owner PID is gone.
