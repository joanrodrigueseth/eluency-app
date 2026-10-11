# Student mobile reliability follow-up

Implemented locally October 11, 2026. No production deployment or physical-device
acceptance is implied by the source and packaging checks below.

## Changes

- SecureStore uses a valid key; the former AsyncStorage key migrates separately.
  Storage tests now enforce Expo's real key-character restrictions.
- Local progress, queued practice sync, downloaded lessons, session snapshots,
  and lesson resumes use student-scoped keys after a verified identity binding.
  Legacy session keys migrate only when a snapshot proves the same student owns
  them. Interrupted migrations retain their original data; downloaded file paths
  remain usable. Another student's data is never imported.
- API calls have a deadline covering headers and body reads, plus cancellation.
  Final assessment submission waits at most 1.5 seconds for best-effort draft
  saves; the final payload still carries every recorded answer.
- Push registration uses an exclusive ownership transaction across student and
  teacher token tables. Reviewed-result payloads include their student ID;
  mobile routing and foreground display require the matching recipient.
  Lock-screen messages do not contain grades or assignment titles.
- Notification taps wait until active practice, test review, and results close.
  They refresh the catalog and results without resetting the active workspace.
- Home test summaries honor review/verification state. Listening and fallback
  speech follow the actual lesson language and direction.
- PDFs use a bundled PDF.js renderer, worker, font/CMap/decoder resources, and
  restrictive WebView content policy. The document is read locally, including
  downloaded PDFs; it is not sent to Google. Errors have a retry state. Browser
  opening is an explicit user action, available only for remote document URLs.
- Removed the inert notification bell. Extracted student settings, dashboard
  header, notification transition logic, speech mapping, and test deadline logic
  while preserving the existing learning flow and dashboard structure.

## Backend rollout

The corresponding Eluency web changes include:

- `supabase/migrations/202610110002_exclusive_mobile_push_ownership.sql`
- mobile push POST registration and reviewed/reminder notification payloads
- focused ownership/security regression checks

The migration reconciles duplicate device-token associations, adds a unique
student-token index, and creates a service-role-only `claim_mobile_push_token`
RPC. Token transfers are transactionally serialized with an advisory lock and
revalidate student-session expiry. No account, assignment, or result is deleted.
Some old duplicate token associations are intentionally cleared; the affected
device can register again on its next login.

Verify the linked project and migration history, review a dry run, apply this
migration, then deploy the backend before releasing the mobile changes. Do not
deploy the route first: registration will fail while its RPC is absent. Update
generated Supabase types after applying the migration. The repository currently
uses a narrow typed adapter for this new RPC because its generated schema is old.

Already queued notifications from an older backend cannot be recalled by these
source changes. Recipient checks prevent them from opening another student's
workspace; new notification bodies deliberately omit private result details.

## Local evidence and acceptance

- `npm run check` in mobile: TypeScript and student regression tests.
- `npm run type-check` and `npm test` in web: types and existing/focused tests.
- Expo production Android/iOS Hermes exports include the offline PDF assets.
- `tests/pdf-renderer-smoke.mjs` renders a generated PDF into a sized canvas with
  accessible page text in isolated headless Chrome. This is browser evidence,
  not Android or iOS WebView evidence.

The earlier Android native build attempt failed on a Gradle download certificate
problem; native compilation was not reverified in this follow-up. iOS native
compilation requires macOS/Xcode. Neither is substituted by JavaScript exports.

Before release, verify on installed Android and iOS builds:

1. Fresh code login, legacy-session migration, restart, and session expiry.
2. Complete practice offline, re-enter the same student's code after expiry,
   and confirm queued work syncs and downloads remain available.
3. Switch between two students on one device; their local data and notification
   destinations stay separate. Verify atomic token transfer in the backend.
4. Interrupt connectivity during draft saving and final test submission;
   confirm eventual server-verified results without losing submitted answers.
5. Tap an assignment/review notification during a timed test and confirm the
   timer and answers remain intact until the test/result flow is closed.
6. Confirm review-pending results have no percentage on Home or Tests; finalize
   a review through web and verify the refreshed grade, feedback, and retry state.
7. Play Spanish/French/Japanese and Portuguese-Spanish prompts in both directions,
   including offline speech fallback.
8. View multi-page, image-based, multilingual, downloaded/offline, invalid, and
   password-protected PDFs. Check VoiceOver/TalkBack and large text settings.
9. Check dark mode, settings, logout, permission-denied notifications, and
   background/foreground switching on a small phone and supported tablet.
