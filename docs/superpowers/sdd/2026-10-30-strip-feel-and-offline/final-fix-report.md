# Final fix report
Items 1-5 done in one commit. Tests-first: stage-clear tests changed, sync reconnect-order test added (failed before the fix), 2 worker tests added (awayAt vs PUT, 8h cap; pass against existing code).
Note: sync retry() must lift `retrying` while flushing presence (action() refuses when retrying).
Result: npm test 76 files 875 tests pass (tests/sim 0 rejections), npm run build ok.
