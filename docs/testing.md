# Refresh tests

The refresh logic uses Node's built-in test runner, so no package install or third-party test dependency is needed.

```sh
node --test scripts/refresh.test.mjs
```

The fixture tests cover CSV quoting and line endings, name normalisation, rejecting decode damage, updating configured fields, preserving last-good values for unmatched records, and classifying link failures. They run offline and do not contact councils or data providers.

The scheduled workflow remains the end-to-end integration path. It accesses live public endpoints and, on success, commits generated data and deploys GitHub Pages. The unit suite does not invoke that workflow.
