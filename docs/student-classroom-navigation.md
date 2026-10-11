# Student classroom navigation

The mobile classroom browser mirrors Eluency's existing student workspace and
`/api/students/classrooms` contract. It uses real `classroom_students` membership,
active `classroom_assignments`, and `classroom_assignment_students` recipients;
it never derives membership from classroom names or exposes classmates.

## Navigation

- The rightmost header action is Settings (gear), replacing the person icon.
- Classroom is available beside Settings and replaces Settings in the bottom menu.
- Choose a classroom, then use Lessons / Tests within its named context.
- Lessons, tests, practice word pools, and displayed test history are scoped by ID.
- A shared lesson can have different due dates and instructions in different
  classrooms; the selected classroom's expectations are used.
- Direct assignments remain separate, reachable through the classroom browser.
- Dashboard, detail, active session, test review, results, and past-test review use
  the same header actions. Active sessions require confirmation before leaving;
  navigation is disabled during final submission. A test's server timer continues.
- Classroom membership is saved with the existing per-student offline snapshot.
  Offline mode shows saved classes and downloaded lessons; tests stay online-only.
- Empty classes remain visible. Lookup errors show a retry state, not a false
  empty-membership message; refresh retains the last known membership on failure.

## Backend impact

The existing Eluency classroom endpoint now accepts the same explicit `session`
query parameter as the mobile session/catalog endpoints. Cookie-authenticated web
requests are unchanged. Deploy this route change before testing against a hosted
API; the existing deployed cookie-only endpoint may reject native requests.
No migration, new table, environment variable, or dependency is required.

## Verification

Automated coverage exercises ID isolation with duplicate classroom names, shared
lesson expectations, direct assignments, empty memberships, native API requests,
active recipient filtering, cookie transport, expired-session rejection, and
navigation/source wiring. Local checks passed: 43 mobile tests, the full Eluency
test suite including 2 classroom endpoint tests, and both repository type checks.
Android/iOS Hermes exports also succeeded. These do not establish device-level
layout or authenticated production behavior. Native-device acceptance remains required:

1. Sign in as students with zero, one, and multiple classroom memberships.
2. Choose each classroom; verify lessons, tests, practice, and history stay scoped.
3. Assign the same lesson to two classes with different instructions/due dates.
4. Change membership or close/archive work in Eluency; pull down to refresh.
5. Download a lesson, switch classrooms, and verify other catalog entries remain.
6. Restart offline; open saved classes and downloaded lessons.
7. Use Settings/Classroom from details, practice, timed tests, review, and results.
   Cancel leaving once; then confirm leaving and resume. Verify timer continuity.
8. Check small-screen layouts, large text, dark mode, and VoiceOver/TalkBack.
