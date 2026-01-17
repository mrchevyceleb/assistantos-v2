# Security Improvements

## Overview

This document tracks security improvements made to AssistantOS to prepare for production release.

## Completed Fixes

### 1. Supabase Credentials Migration (CRITICAL - Fixed)

**Issue**: Hardcoded Supabase credentials in source code (`src/services/memory/constants.ts:8-9`)

**Risk**:
- Credentials visible in git history and compiled app
- All users share same database without isolation
- Potential for data leakage between users

**Fix Applied**:
1. Created `.env.example` with placeholder values
2. Added dotenv dependency
3. Updated `electron/main.ts` to load environment variables
4. Modified `src/services/memory/constants.ts` to read from `process.env`
5. Added `isMemoryConfigured()` check in `supabaseClient.ts`
6. Created this security documentation

**Migration Notes**:
- `.env` file created with original shared credentials (temporarily for backward compatibility)
- `.env` is in `.gitignore` (credentials no longer in source control)
- Users should create their own Supabase project and replace credentials

**Next Steps for Production**:
1. Create production Supabase project
2. Implement Row Level Security (RLS) policies:
   ```sql
   -- Example RLS policy for user_facts table
   ALTER TABLE user_facts ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "Users can only access their own facts"
   ON user_facts
   FOR ALL
   USING (user_id = auth.uid());
   ```
3. Update `.env` with production credentials
4. Document setup process in README

**Files Changed**:
- `electron/main.ts` - Added dotenv loading
- `src/services/memory/constants.ts` - Environment variable support
- `src/services/memory/supabaseClient.ts` - Configuration validation
- `.env.example` - Template for users
- `.env` - Local configuration (gitignored)
- `.gitignore` - Already had .env exclusion

### 2. SafeStorage Infrastructure (HIGH - Partially Complete)

**Status**: Foundation implemented, migration pending

**Completed**:
1. Created `electron/security/safeStorageHandlers.ts` with IPC handlers
2. Exposed safe Storage API through `electron/preload.ts`
3. Registered handlers in `electron/main.ts`
4. Added TypeScript type definitions

**Files Changed**:
- `electron/security/safeStorageHandlers.ts` - New IPC handlers
- `electron/main.ts` - Handler registration
- `electron/preload.ts` - API exposure
- `tsconfig.node.json` - Include security folder

**Remaining Work**:
1. Persist encrypted credentials to disk (currently memory-only)
2. Create migration service to move localStorage → safeStorage
3. Modify appStore to exclude sensitive fields from persistence
4. Create SecureCredentialService for React components
5. Update all code accessing API keys/OAuth tokens

**Note**: Current implementation provides encryption via Electron safeStorage API but stores in memory. Credentials will be lost on app restart until disk persistence is added.

### 3. Path Validation Enforcement (HIGH - Fixed)

**Issue**: `validatePath()` existed but was never called in file handlers

**Fix Applied**:
- Added `validatePath()` calls to all file operation handlers:
  - Read operations: `readDir`, `readFile`, `readFileBase64`
  - Write operations: `writeFile`, `createDir`, `edit`
  - Destructive operations: `rename`, `delete`
- Paths must be within workspace or app data directories

**Files Changed**:
- `electron/main.ts` - Added validation to 8+ IPC handlers

### 4. IPC for Simple API Calls (HIGH - Fixed)

**Issue**: `dangerouslyAllowBrowser: true` in 4 files exposed API key in browser memory

**Fix Applied**:
- Moved simple API calls to main process via IPC:
  - `src/services/titleGenerator.ts` - Now uses `window.electronAPI.anthropic.createMessage()`
  - `src/services/intent/aiFallback.ts` - Now uses `window.electronAPI.anthropic.createMessage()`
  - `src/components/settings/SettingsModal.tsx` - Now uses `window.electronAPI.anthropic.validateKey()`
- Created `electron/api/anthropicHandlers.ts` for secure API calls
- Main ClaudeService (`src/services/claude.ts`) retains Agent SDK pattern with `dangerouslyAllowBrowser: true` for streaming
  - This is acceptable in Electron with contextIsolation enabled
  - Documented in CLAUDE.md as intentional architecture

**Files Changed**:
- `electron/api/anthropicHandlers.ts` - New IPC handlers
- `electron/main.ts` - Handler registration
- `electron/preload.ts` - API exposure
- `src/services/titleGenerator.ts` - Uses IPC
- `src/services/intent/aiFallback.ts` - Uses IPC
- `src/components/settings/SettingsModal.tsx` - Uses IPC

### 5. Electron Sandbox Enabled (MEDIUM - Fixed)

**Issue**: `sandbox: false` in BrowserWindow configuration

**Fix Applied**:
- Changed `sandbox: false` to `sandbox: true` in `electron/main.ts`
- Preload script now runs in restricted environment
- All communication goes through contextBridge

**Files Changed**:
- `electron/main.ts` - Enabled sandbox

## Pending Fixes

### Medium Priority

#### 6. Webview Permissions Too Broad (MEDIUM - TODO)
- **Issue**: Allows camera, mic, geolocation to any website
- **Location**: `electron/main.ts:162-169`
- **Fix**: Whitelist only necessary permissions

#### 7. Missing CSP in Development (MEDIUM - TODO)
- **Issue**: No Content Security Policy in dev mode
- **Location**: `electron/main.ts:116-135`
- **Fix**: Apply CSP in all modes

#### 8. ReDoS Risk in Glob Pattern (MEDIUM - TODO)
- **Issue**: Glob-to-regex vulnerable to malicious patterns
- **Location**: `electron/main.ts:924-956`
- **Fix**: Validate/sanitize glob patterns before conversion

## Security Best Practices

### For Users

1. **Never share your `.env` file** - It contains sensitive credentials
2. **Create your own Supabase project** for production use
3. **Use strong API keys** and rotate them regularly
4. **Enable 2FA** on all connected services (Gmail, Calendar, etc.)
5. **Keep the app updated** to receive security patches

### For Developers

1. **Never commit credentials** to git
2. **Use environment variables** for all sensitive data
3. **Validate all user input** before file operations
4. **Enable Electron security features** (sandbox, CSP, etc.)
5. **Use Electron safeStorage** for local credential storage
6. **Implement proper error handling** without exposing system details
7. **Regular security audits** of dependencies (`npm audit`)

## Reporting Security Issues

If you discover a security vulnerability, please email security@assistantos.dev (or create a private GitHub security advisory) instead of opening a public issue.

## Security Audit History

- **2026-01-17**: Initial production readiness audit (70+ issues identified)
- **2026-01-17**: Sprint 1 Security Fixes Completed:
  - Critical fix #1 - Supabase credentials migrated to environment variables
  - High fix #2 - SafeStorage infrastructure created for encrypted credentials
  - High fix #3 - Path validation added to all file handlers
  - High fix #4 - Simple API calls moved to main process via IPC
  - Medium fix #5 - Electron sandbox enabled
