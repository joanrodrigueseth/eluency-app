# Student-only mobile transition

Decision: Expo is the student companion app. The Next.js application is the
teacher and school management workspace. Preserve the existing student layout
and API contracts throughout the transition.

## Phase 1: Student-only entry and application shell

Implemented October 11, 2026.

- Root navigation registers only Login and StudyGame, with a student-only
  navigation type. Existing teacher screens remain on disk for the later audit.
- Login opens directly to access-code entry and the existing student demo.
  Teacher login, OAuth, registration, and plan selection are absent.
- The shell restores only the student session. Stored teacher credentials no
  longer choose the initial screen or run registration callbacks.
- Session subscriptions replace the five-second storage polling interval.
  Failed secure-session writes show an error before entering the workspace.
- The existing home, lessons, practice, tests, progress, downloads, achievements,
  guide, and student settings remain within StudyGameScreen.
- Push registration uses the student session. Assignment and reminder taps open
  the student workspace; reviewed-result taps open Tests and refresh its data.
  Teacher and unknown notification types are ignored.
- Student logout unregisters the token, attempts session revocation, clears
  local session storage, and returns to code entry even if a remote request fails.
- Classroom name formatting imports its shared contract directly, avoiding the
  teacher classroom API client in the study screen.

Validation: TypeScript passes; all 18 contract tests pass, including four
student notification-routing tests; Expo Android production bundle export passes.
This is bundle validation, not a native installation or authenticated device test.

No database migration, backend endpoint, environment variable, package
installation, or native configuration change was required.

## Phase 2: Remove teacher dependencies from student code

Implementation complete October 11, 2026; authenticated device validation pending.

- StudyGameScreen uses StudentMobileStackParamList. Teacher-preview branches,
  preview controls, and all teacher Dashboard return paths are removed.
- The root navigator mounts only Login when signed out and only StudyGame when
  signed in. A session-specific navigator key discards the previous student's
  component state when accounts change. Login and logout rely on the shell's
  session subscription instead of imperative navigation resets.
- Study bootstrap reads the persisted student session without falling back to
  stale route credentials. HTTP 401 clears student access on both initial load
  and background catalog refresh. Network failure retains the existing offline
  catalog path.
- mobileNotifications no longer imports Supabase or supports teacher bearer
  authentication. Student unregister requires a session ID. The retired teacher
  settings screen imports its helper from teacherMobileNotifications instead.
- endStudentSession clears local access first, unregisters student push before
  revocation, and bounds remote cleanup with a five-second abort signal.
- In-flight push registration is cancelled when the session changes. Old logout
  cleanup preserves the remembered token if a different student has signed in.
- Cold-start notification responses are handled once for a restored session;
  subsequent sign-ins do not replay a previous account's notification response.
- The approved student layout, offline storage, assignments, and result-review
  contracts are preserved.

Validation: TypeScript passes; all 28 tests pass; Expo Android and iOS production
bundle exports pass. A recursive import-graph test verifies that the shipped app
contains neither teacher management screens nor Supabase/OAuth/registration
modules. Mocked-native tests exercise the real session and notification helpers,
including migration, storage failure, switching users, cancellation, and logout.

The broad navigation types remain solely for the teacher files retained until
phase 3. Teacher-native plugins and package dependencies also remain pending
phase 3; bundle export does not prove their removal from a native application.
No backend, database, environment-variable, or installed dependency changes.

Device acceptance checks still open:

- Expire a session while studying and while resuming from the background; verify
  the app returns to code entry without falling back to an offline expired session.
- Log out offline, sign into another student, and verify old lessons, progress,
  downloads, and notification responses do not appear in the new workspace.
- Restart offline with a valid persisted session and downloaded lessons.
- Complete a test, review it through the teacher web workspace, and tap the
  reviewed-result notification to verify refreshed results and feedback.
- Verify native push permission, registration, delivery, and logout behavior.

## Phase 3: Retire teacher files and native capabilities

Implementation complete October 11, 2026; native compilation and device
acceptance remain open.

- Removed 18 teacher/admin screens and their exclusively used components,
  authoring helpers, Supabase/OAuth/registration code, API clients, and legacy
  navigation types. Only LoginScreen and StudyGameScreen remain in screens.
- Removed 64 retired source/test/documentation files and the Google sign-in
  asset. Their current contents, including uncommitted work, were archived
  before removal.
- Removed 13 teacher-only direct dependencies and synchronized the package lock
  and local install. Retained the packages used by student PDF/audio viewing,
  downloaded lessons, clipboard, speech, secure sessions, and notifications.
- Removed Apple sign-in configuration, photo-library usage text, and the Apple
  auth, image-picker, web-browser, and date-picker native plugins.
- Retired teacher-only tests and added source/configuration regression checks.
  Student result review, session, push, classroom attribution, and content
  compatibility tests remain.
- Added README.md, a student-only .env.example, and draft student store copy.
  Updated the iOS setup guide, login checkpoint, and mobile follow-up list.
- Preserved the app name, slug, URL scheme, iOS/Android identifiers, existing
  student layout, and backend/API contracts. No web app or database changes.

Validation:

- TypeScript and all 22 remaining tests pass.
- npm's installed dependency tree is valid.
- Expo production JavaScript/Hermes exports pass for Android and iOS.
- Expo native-module resolution excludes the retired packages on both platforms.
- Expo configuration introspection produces no Apple sign-in entitlement or
  camera/photo-library usage permission. Student push entitlement remains.
- The existing Android manifest already blocks camera, recording, and external
  storage permissions; no local generated native files were rewritten.

Android native debug compilation was attempted using Android Studio's bundled
Java runtime. It stopped before project compilation because the Gradle wrapper
distribution download failed Java certificate validation; the Windows trust-store
retry also failed to initialize its trust store. Fix that local build environment
or use the existing EAS build profiles for the native-build check.
iOS native compilation requires macOS/Xcode. No app was installed on a physical
device, published, or submitted to either store.

Fresh native binaries are required to remove capabilities from an installed
application. Complete the device acceptance checks above before release.

## Recovery checkpoint

The subsequent reliability review and fixes are documented in
[student-mobile-reliability.md](student-mobile-reliability.md). They add backend
push-ownership changes and an offline PDF.js dependency; unlike phase 3, that
follow-up includes a database migration which has not been deployed.

The worktree contained extensive uncommitted changes before this transition.
The phase-3 recovery archive is local and ignored by Git:

`.expo/student-only-phase3-recovery.zip`

It contains 138 entries and excludes .env, credentials, and generated native
projects. SHA-256:

`B14EA802C1610669C8CFB68A972F5A6BE778293081DE77ED3EADD03E63D16C58`

To inspect or recover a retired file, extract the archive to a separate temporary
directory and copy back only the needed entry. Do not extract it over the current
student application or stage the entire dirty worktree.
The ignored archive is a local recovery aid, not a committed backup.
