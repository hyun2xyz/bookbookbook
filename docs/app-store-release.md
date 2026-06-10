# Bookbookbook App Store Release Checklist

Last updated: 2026-06-11

## Current Status

Bookbookbook is ready for Mac App Store release preparation, but this machine cannot produce an App Store upload package yet.

Current blockers checked locally:

- Full Xcode is not selected. `xcode-select -p` points to `/Library/Developer/CommandLineTools`.
- No Apple code-signing identities are installed. `security find-identity -v -p codesigning` returns `0 valid identities found`.
- The Mac App Store provisioning profile is not present at `desktop/build/Bookbookbook_Mac_App_Store.provisionprofile`.
- The Apple Developer portal is showing a program license update notice. The account holder must review and accept it before App Store Connect resources continue normally.

## Apple Account Tasks

These steps must be done by the Apple Developer account holder.

1. Open Apple Developer / App Store Connect and click `계약 검토하기`.
2. Review and accept the latest Apple Developer Program License Agreement.
3. Create or confirm the Bundle ID:

```text
xyz.hyun2.bookbookbook
```

4. Create/download Mac App Store distribution assets:

- Apple Distribution signing certificate in Keychain.
- Mac Installer Distribution signing certificate in Keychain.
- Mac App Store provisioning profile for `xyz.hyun2.bookbookbook`.

Save the provisioning profile here:

```text
desktop/build/Bookbookbook_Mac_App_Store.provisionprofile
```

5. Create the App Store Connect app record.

Recommended initial values:

- App name: `Bookbookbook`
- Bundle ID: `xyz.hyun2.bookbookbook`
- SKU: `bookbookbook-macos`
- Category: `Productivity`
- Privacy: PDFs are processed locally in the app. The app does not upload PDFs to Bookbookbook servers.

## Local Machine Tasks

Install full Xcode and select it:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -version
```

Run the App Store preflight:

```bash
cd /Users/han/Documents/git/project_book/desktop
npm run preflight:mas
```

When preflight passes, build the MAS package:

```bash
cd /Users/han/Documents/git/project_book/desktop
npm run dist:mas
```

The regular DMG and Windows builds are separate from this path.

## App Store Build Differences

The MAS build uses:

- App Sandbox entitlements.
- User-selected file read/write entitlement for opening PDFs and saving outputs.
- App Store update behavior. `업데이트 확인` shows an App Store update message instead of linking to GitHub Releases.
- The existing ad-hoc signing hook is skipped for MAS builds, so App Store signing is not overwritten.

## Reference Links

- [Apple: Add a new app in App Store Connect](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app)
- [Apple: Create a distribution provisioning profile](https://developer.apple.com/help/account/provisioning-profiles/create-a-distribution-provisioning-profile)
- [Apple: App privacy details](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)
- [Electron: Mac App Store submission guide](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide)
