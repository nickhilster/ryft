/**
 * Helper utilities for web application testing with Playwright.
 */

/**
 * Wait for a condition to become true with a timeout.
 * @param {Function} condition
 * @param {number} timeout
 * @param {number} interval
 * @returns {Promise<boolean>}
 */
async function waitForCondition(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Condition not met within timeout');
}

/**
 * Capture browser console logs.
 * @param {import('playwright').Page} page
 * @returns {Array<{type: string, text: string, timestamp: string}>}
 */
function captureConsoleLogs(page) {
  const logs = [];

  page.on('console', (msg) => {
    logs.push({
      type: msg.type(),
      text: msg.text(),
      timestamp: new Date().toISOString(),
    });
  });

  return logs;
}

/**
 * Save a full-page screenshot with an automatic timestamped name.
 * @param {import('playwright').Page} page
 * @param {string} name
 * @returns {Promise<string>}
 */
async function captureScreenshot(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${name}-${timestamp}.png`;

  await page.screenshot({ path: filename, fullPage: true });
  return filename;
}

module.exports = {
  waitForCondition,
  captureConsoleLogs,
  captureScreenshot,
};