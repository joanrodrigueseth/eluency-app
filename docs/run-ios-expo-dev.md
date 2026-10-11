# Run the student app on iOS (Mac)

## Requirements

Use a Mac with Xcode, its command-line tools, and a Node.js version supported by
the installed Expo SDK. Open Xcode once to complete its setup. Native builds
also require CocoaPods.

## Install and start

Open Terminal in the `eluency-app` repository:

```sh
npm ci
npm run check
npm start
```

Press `i` to open the iOS simulator with Expo Go, or scan the QR code in Expo Go
on an iPhone connected to the same network.

The app opens to student access-code entry. Ask a teacher for a six-character
code, or use the existing shared student demo. Teacher registration and
Google/Apple sign-in are no longer part of the mobile application.

The API uses `app.json` by default. See the
[README](../README.md#api-configuration) for the optional development override.
No Supabase or OAuth environment variables are required.

## Native development build

Remote notification delivery needs an installed native build. On the Mac:

```sh
npm run ios
npm run start:dev-client
```

For a physical device, use the project's existing EAS development profile or
run `npx expo run:ios --device` with the appropriate Xcode signing setup.
The existing bundle ID is `com.eluency.mobile`.

After the phase 3 native-plugin cleanup, install a fresh native binary. Updating
JavaScript in an older binary will not remove its prior capabilities.

## Troubleshooting

If Metro appears stale, stop it and run:

```sh
npm start -- --clear
```

For a simulator launch failure, open Xcode and the Simulator app before retrying.
For a real-device connection failure, check that the phone can reach the
development computer and the configured API address.

## Device checks

Verify code entry and clipboard paste, session persistence and expiry, switching
students, downloaded lessons, audio/PDF viewing, test submission, teacher-reviewed
feedback, and assignment/result notifications. TypeScript and bundle exports do
not substitute for those checks.
