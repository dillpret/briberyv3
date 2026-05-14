# Agent Guidance

## Visual Inspection For Frontend Changes

When changing UI, styling, images, icons, layout, or user-facing copy in the Angular frontend, verify the result visually before calling the work done.

- Start or restart the frontend dev server from `src/frontend/bribery-game-client` so new files under `public/` are picked up.
- First check direct asset URLs for new static files, especially files under `public/brand/`, and confirm they return `200` with the expected content type.
- Generate screenshots at both mobile and desktop viewport sizes for the affected screen. Use the in-app Browser plugin when available; otherwise use local browser automation such as headless Edge/Chrome or Playwright.
- Inspect the screenshots, not only the DOM. Look for broken images, bad cropping, text overlap, awkward spacing, unintended backgrounds, poor mobile wrapping, and whether the visual asset actually appears in context.
- For states that are hard to reach through live app flow, create a temporary local preview or use an existing route/state setup to render the same component classes and markup. Do not commit temporary preview files.
- Mention in the final response which screenshots or viewport checks were performed and call out any visual issues or limitations.

For this app specifically, landing, lobby, waiting states, and small app icons should be checked when branding assets change.
