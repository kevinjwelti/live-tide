# Putting Live Tide on a TV

This is the list of what you do yourself. The app is already built. It is one Android app that runs on a Fire TV Stick and on Google TV / Android TV. It opens the Live Tide page full screen, with the remote.

The picture on the TV is the same page as the website, in its quiet TV mode: https://kevinjwelti.github.io/live-tide/?kiosk&tv=1

You do not need to write code for the steps below.

## Try it on your Fire Stick before any store

1. On the computer, open the Live Tide project on GitHub.
2. Open the Actions tab and click the workflow named **Android TV debug APK**.
3. Open the newest run that finished with a green check. Download the artifact named **live-tide-tv-debug**. Unzip it. Inside is an `.apk` file.
4. On the Fire Stick: Settings → My Fire TV → About → click the name of the device seven times, until it says you are a developer.
5. Settings → My Fire TV → Developer options. Turn on **ADB debugging** and **Install unknown apps** (the wording is sometimes “Apps from Unknown Sources”).
6. On the same Wi‑Fi, find the stick’s IP address under Settings → My Fire TV → About → Network.
7. On the computer, with the free Android platform tools installed:

```
adb connect THE.STICK.IP.ADDRESS
adb install -r live-tide-tv-debug.apk
```

8. The stick’s home row gets a Live Tide tile. Open it. The first open needs the internet. After that, a short outage shows “Reconnecting…” and then comes back, and a copy of the page stays on the device.

The remote: arrows wake **Forecast** and **Scenes**, with a light ring on the one you are on. OK opens it. Back closes what you opened, and Back again leaves the app.

## The key you must keep

Both stores will ask for a signed app when you ship for real. The debug file above is only for your own stick. Do this once, on your own computer, and do not put the file in git or in email.

```
keytool -genkeypair -v -keystore live-tide-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

It asks for a password and your name. Remember the password. Copy `tv-app/keystore.properties.example` to `tv-app/keystore.properties` and fill in the password and the file name. Keep `live-tide-upload.jks` and that password somewhere safe, offline. If you lose them, the stores will not let you update the same app.

Then, from the `tv-app` folder:

```
./gradlew assembleRelease
```

The file to upload is `tv-app/app/build/outputs/apk/release/app-release.apk`. Google Play will also accept an Android App Bundle (`.aab`) from `./gradlew bundleRelease`. Prefer the bundle for Google. Amazon takes the APK.

## Amazon Appstore (Fire TV)

The Amazon developer account is free. Create it at https://developer.amazon.com with the Amazon account you want the app under. They may ask you to confirm your identity.

In the Appstore console, create a new Android app, and say it is for Fire TV.

Upload the release APK. Paste the listing text below. Upload the pictures from `tv-app/store/` (the table at the bottom of this file says which file is which).

Category: Weather.

Content rating: answer “none” for violence, sex, strong language, and drugs. No user accounts, no chat, no ads, no purchases, no location. The rating should come out as the youngest band (Amazon’s “All ages”).

Privacy policy URL:

https://kevinjwelti.github.io/live-tide/privacy.html

Submit. Review is often a few days. You can still sideload the debug build while you wait.

## Google Play (Google TV / Android TV)

A Play Console account is a one-time $25 fee, and Google checks a government ID. Create it at https://play.google.com/console.

This app is TV-only. In the console, add an Android TV form factor and use the TV banner and the 1920×1080 screenshots. Do not upload phone screenshots as if they were the product.

Target API: Google’s rule for Android TV apps, checked November 2026, is Android 14 (API 34) or higher. This project targets Android 15 (API 35), which meets that. Phone apps are on a stricter rule (API 36). If Play Console ever tells you the TV app must move up, it is a one-line change in `tv-app/app/build.gradle.kts` (`targetSdk`).

Personal accounts created after 13 November 2023 cannot go straight to production. Google’s current rule (still in force as of November 2026; confirm it in your own console because they do change it):

- You must run a **closed test**, not an internal test.
- At least **12 testers** must opt in, and stay opted in, for **14 days in a row**.
- Inviting someone is not enough. They have to open the link and join.
- If someone leaves and rejoins, their 14 days start over.
- Then you apply for production from the Play Console dashboard and answer a short form about the test. Google reviews that application too.

A company account, or a personal account created before that date, may not have this wait. The console tells you if it applies to you.

Category: Weather.

Content rating questionnaire, in plain answers: no violence, no fear, no sex, no language, no drugs, no gambling, no user-generated content, no unrestricted web (the app opens only Live Tide), no location sharing, no ads, no purchases. Expected result: Everyone / PEGI 3.

Privacy policy URL: the same page as Amazon.

Turn on Play App Signing when they offer it. You keep the upload key from the section above. Google holds the key that devices actually install.

## Listing text

Title: Live Tide

Short description (under 80 characters):

A quiet full-screen tide chart for the living room.

Full description:

Live Tide is a tide clock for the television.

The curve of the day sits on a shore. Noon, dusk, and night change on their own. At night the photograph steps back and the stars come out.

The lagoon is the picture it opens on. Scenes, on the remote, switches to black sand, a reef, a tide pool, the older tropical shore, or the plain chart. The choice stays.

Arrows move. OK opens Forecast or Scenes. Back closes them.

It does not ask you to sign in. A short loss of internet shows “Reconnecting…” instead of a blank screen.

## Pictures to upload

All of these are in `tv-app/store/`.

| File | Use |
| --- | --- |
| `icon-512.png` | Large icon, both stores. 512×512. |
| `icon-114.png` | Amazon’s small icon. 114×114. |
| `play-tv-banner-320x180.png` | Already inside the app, for the TV home row. Also keep a copy for your records. |
| `play-tv-banner-1280x720.png` | Google Play’s TV banner. |
| `fire-tv-icon-1280x720.png` | Fire TV icon in the app row. No see-through pixels. The title sits in the middle. |
| `fire-tv-background-1920x1080.jpg` | Optional Fire TV backdrop when someone pauses on the app. |
| `screenshots/lagoon.png` | The default shore. |
| `screenshots/black-sand.png` | Black sand. |
| `screenshots/colorful-reef.png` | Colorful Reef I. |
| `screenshots/scene-picker.png` | The scene list open. |

Amazon wants 3 to 10 screenshots, 1920×1080, landscape. These four cover it. Google TV wants the same shape.

## What can block you

- The $25 Play Console fee and the ID check are Google’s, and only you can complete them.
- The 12-tester, 14-day closed test is Google’s, for newer personal accounts. Amazon does not have that wait.
- The upload keystore is yours. Nobody else should create a second one later.
- The first launch of the app needs a network. Offline only works after it has opened successfully once.
- Fire OS 7 and Fire OS 8 sticks are the ones this build is aimed at (Android 9 and newer). A very old stick on Fire OS 5 will refuse it.
