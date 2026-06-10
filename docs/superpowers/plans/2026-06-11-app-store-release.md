# App Store Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare Bookbookbook for Mac App Store packaging without breaking the existing DMG, Windows, or GitHub Pages release paths.

**Architecture:** Keep App Store packaging isolated behind `desktop` MAS scripts and config. Regular DMG builds continue to use the existing ad-hoc signing hook, while MAS builds use Apple Distribution signing, App Sandbox entitlements, and a provisioning profile.

**Tech Stack:** Electron, electron-builder, macOS codesign, Apple Developer certificates, App Store Connect.

---

### Task 1: Add MAS Build Configuration

**Files:**
- Modify: `/Users/han/Documents/git/project_book/desktop/package.json`
- Create: `/Users/han/Documents/git/project_book/desktop/build/entitlements.mas.plist`
- Create: `/Users/han/Documents/git/project_book/desktop/build/entitlements.mas.inherit.plist`

- [x] **Step 1: Add `preflight:mas` and `dist:mas` scripts**

Run:

```bash
cd /Users/han/Documents/git/project_book/desktop
npm run preflight:mas
```

Expected before Apple setup: FAIL with missing Xcode, app distribution identity, installer distribution identity, and provisioning profile.

- [x] **Step 2: Add App Sandbox entitlements**

Expected: MAS config references `build/entitlements.mas.plist` and `build/entitlements.mas.inherit.plist`.

### Task 2: Protect MAS Signing

**Files:**
- Modify: `/Users/han/Documents/git/project_book/desktop/scripts/after-pack.cjs`

- [x] **Step 1: Skip ad-hoc signing for MAS targets**

Expected: regular DMG still ad-hoc signs; MAS target is left for Apple Distribution signing.

### Task 3: Split Update Behavior

**Files:**
- Modify: `/Users/han/Documents/git/project_book/desktop/main.cjs`

- [x] **Step 1: Route `업데이트 확인` through `handleUpdateCheck`**

Expected: non-MAS builds keep GitHub release update checks.

- [x] **Step 2: Show App Store update guidance in MAS builds**

Expected: MAS builds do not link users to GitHub release downloads for updates.

### Task 4: Document Release Flow

**Files:**
- Create: `/Users/han/Documents/git/project_book/docs/app-store-release.md`
- Modify: `/Users/han/Documents/git/project_book/README.md`

- [x] **Step 1: Add Apple account and local machine checklist**

Expected: the document separates account-holder actions from local packaging work.

- [x] **Step 2: Link the checklist from README**

Expected: README points maintainers to the App Store checklist near the release notes.

### Task 5: Verify

**Files:**
- Test: `/Users/han/Documents/git/project_book/desktop/tests/smoke.mjs`

- [ ] **Step 1: Run desktop smoke**

Run:

```bash
cd /Users/han/Documents/git/project_book/desktop
npm run smoke
```

Expected: PASS.

- [ ] **Step 2: Run MAS preflight**

Run:

```bash
cd /Users/han/Documents/git/project_book/desktop
npm run preflight:mas
```

Expected now: FAIL with actionable missing Apple/Xcode prerequisites.

Expected after Apple setup: PASS.
