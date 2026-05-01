/**
 * Escapes special regex characters from a user-provided search string
 * to prevent regex injection / ReDoS attacks.
 */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Validates that a value is one of the allowed enum values.
 * Returns undefined if the value is not allowed, so the query key is omitted.
 */
const safeEnum = (value, allowed) => (allowed.includes(value) ? value : undefined);

module.exports = { escapeRegex, safeEnum };
