/**
 * Environment gates for developer conveniences.
 *
 * FAIL CLOSED. These were previously written as `NODE_ENV !== "production"`,
 * which is only safe if NODE_ENV is reliably set. It is not: Cloudflare Workers
 * do not set NODE_ENV, and it was absent from the deployed Worker's bindings -
 * so `undefined !== "production"` was true and every developer bypass was LIVE
 * in production. That included a fixed master OTP code (log in as any worker
 * from their phone number alone), a password-reset token returned in the API
 * response (admin takeover in two requests), and a fixed TOTP code that
 * defeated two-factor auth.
 *
 * Inverting the test removes the whole class of failure: a bypass now requires
 * someone to deliberately opt in. Forgetting to configure anything - a new
 * environment, a fresh deploy, a missing binding - leaves the bypasses OFF,
 * which is the direction a mistake should fail in.
 *
 * Read lazily, never at module scope: Workers only populate process.env from
 * bindings once request handling begins (see the same note in auth.ts).
 */

/** True only when explicitly running locally. Never true by accident. */
export function isDevEnvironment(): boolean {
  return process.env.NODE_ENV === "development";
}

/** True only under the automated test suite. */
export function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === "test";
}

/**
 * Developer login shortcuts: the master OTP code, the TOTP bypass code, and
 * returning a password-reset token in the response body. Allowed in local
 * development and under test; never anywhere else.
 */
export function devAuthShortcutsEnabled(): boolean {
  return isDevEnvironment() || isTestEnvironment();
}
