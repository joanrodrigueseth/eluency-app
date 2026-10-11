# Eluency mobile

Eluency is the student companion app, built with Expo and React Native.
Teachers and school staff create, assign, and review work in the Eluency web
application. This repository contains student code entry and the study workspace.

## Setup

Use a Node.js version supported by the installed Expo SDK and capable of running
the built-in TypeScript test runner. Install the locked dependencies:

```sh
npm ci
npm run check
npm start
```

Students enter the six-character code provided by their teacher. No student
email/password registration, Google/Apple sign-in, teacher subscriptions, or
Supabase client configuration is required in this app.

The existing student demo is available from the login screen. It uses a shared
demo session, so its progress is not private to one tester.

## API configuration

Production builds use `expo.extra.apiBaseUrl` in `app.json`, currently
`https://www.eluency.com`. To use another backend during development, copy
`.env.example` to `.env` and set `EXPO_PUBLIC_API_BASE_URL`. Use an address
reachable from the device; a computer's localhost is not the phone's localhost.

Existing Google/Supabase public variables in a local `.env` are no longer
consumed by this app. Do not put service-role keys or other secrets in mobile
environment variables.

## Running on devices

```sh
npm run android
# macOS with Xcode:
npm run ios
# after installing a development build:
npm run start:dev-client
```

Expo Go is useful for initial UI checks. Remote push needs an installed native
development or release build; the student app retains its foreground assignment
notification fallback when device-token registration is unavailable.

Teacher-native plugins were removed during phase 3. Install a newly built native
app to verify this change; a JavaScript update does not remove capabilities from
an already installed binary. Keep the existing `com.eluency.mobile` identifiers
and `eluency` URL scheme.

## Checks and release handoff

`npm run check` runs TypeScript and the student contract tests. The tests cover
assignment attribution, study content normalization, reviewed results, session
storage, logout, push routing, and the student-only source/native configuration.

Local bundle exports check packaging for both platforms:

```sh
npx expo export --platform android --platform ios
```

Lesson PDFs are rendered on-device with [Mozilla PDF.js](https://mozilla.github.io/pdf.js/).
Metro generates the renderer, worker, fonts, CMaps, and decoding assets from the
locked dependency under `.expo/pdf-viewer`; there is no runtime CDN or Google
document viewer. Those ignored assets are regenerated on each Metro start/export.
For a desktop renderer smoke test, run
`node --experimental-strip-types tests/pdf-renderer-smoke.mjs`
after starting Metro or loading its configuration.
Set `ELUENCY_CHROME_PATH` if Chrome is installed at a different location.

The reliability follow-up also changes the supporting web API. Apply
`202610110002_exclusive_mobile_push_ownership.sql` in the web repository **before**
deploying its updated push-registration route. The migration transfers device
tokens atomically between recipients; it does not change lessons or results.
Regenerate Supabase types after deployment. See
[the reliability handoff](docs/student-mobile-reliability.md) for the migration
and device acceptance checklist.

Native installations and authenticated device checks remain separate. See
[the phased transition and device checks](docs/student-only-mobile-transition.md)
and [the iOS development guide](docs/run-ios-expo-dev.md).
Suggested store text is in [student app store copy](docs/student-app-store-copy.md);
it has not been published.

The retired teacher files and their uncommitted edits were saved locally in
`.expo/student-only-phase3-recovery.zip` before removal. That ignored archive
is not committed, bundled, or a permanent replacement for source control.
