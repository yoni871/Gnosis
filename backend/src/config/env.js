// Normal startup retains dotenv's existing cwd lookup and non-overriding behavior.
// Tests opt out explicitly, including tests of NODE_ENV=production/development.
function loadEnvironment(options) {
    if (process.env.GNOSIS_TEST_ISOLATION === '1') return;
    if (process.env.GNOSIS_LOCAL_DEV === '1') return;
    return require('dotenv').config(options);
}

module.exports = { loadEnvironment };
