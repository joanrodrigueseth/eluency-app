# Student app follow-up

The mobile app serves students; teacher and school management belongs to the web
application. The three implementation phases are recorded in
[docs/student-only-mobile-transition.md](docs/student-only-mobile-transition.md).

Before release:

- Verify real code login, expiry, logout, and switching students on iOS/Android.
- Verify downloaded lesson playback and progress sync after reconnecting.
- Complete a test, review it on the web, and verify student feedback and push delivery.
- Check keyboard/clipboard entry, screen-reader labels, tablet layout, and text scaling.
- Build fresh native binaries with the reduced plugin/dependency configuration.
- Capture student-only screenshots and review the draft store copy.

Possible future improvements, not implemented by this transition:

- Localize student microcopy using an agreed language strategy.
- Refine student learning states based on real-device feedback.

Earlier teacher/admin mobile ideas are preserved in
`.expo/student-only-phase3-recovery.zip` and no longer describe this app's scope.
