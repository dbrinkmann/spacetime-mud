# Third-party interpreter

The bundled interpreter at `spacetimedb/src/vendor/interpreter.js` is generated from `js-interpreter@6.0.2` (Neil Fraser's JS-Interpreter, npm packaging by Amin Marashi), licensed Apache-2.0. Upstream copyright and license comments are retained in the bundle. The project root `LICENSE` contains the Apache-2.0 license.

Upstream: https://github.com/NeilFraser/JS-Interpreter
Npm package source: https://github.com/aminmarashi/JS-Interpreter

Generate with `node scripts/bundle-interpreter.mjs`. The bundle excludes Node's optional regular-expression VM support; the runtime adapter rejects regex and native-library execution. See `spacetimedb/src/scripts.ts` for the application-specific limits and API boundary.
