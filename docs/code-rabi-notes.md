# code-rabi notes

DECISION (v0.1): ship socket-only. IBKR_MODE=oauth returns "not implemented" until v0.2.
Reason: avoids browser-controller dependency (Puppeteer/Playwright + headless browser lifecycle).
Reconsider once we have a real user need for OAuth (e.g. running in CI without TWS).
