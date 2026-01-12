# Code Signing Setup Guide

This guide explains how to set up code signing for AssistantOS to eliminate the "Unknown Publisher" warning on Windows.

## Why Code Signing?

Without code signing, Windows Defender SmartScreen shows a warning when users download and run your app. Code signing:
- Removes the "Unknown Publisher" warning
- Builds user trust
- Proves the executable hasn't been tampered with
- Required for Windows Store distribution (if you go that route)

## Step 1: Get a Code Signing Certificate

### Option A: Paid Certificate (Recommended for Production)

| Provider | Type | Cost/Year | Validation |
|----------|------|-----------|------------|
| **SSL.com** | EV Code Signing | $200-300 | Extended (USB token) |
| **Sectigo** | Standard Code Signing | $100-200 | Standard |
| **DigiCert** | Standard Code Signing | $400+ | Standard |

**Recommendation**: Start with **Sectigo** for best value, upgrade to **EV (Extended Validation)** later for instant trust.

### Option B: Free for Open Source

**SignPath.io** offers free code signing for open source projects:
- Free tier: Up to 10 signatures/month
- Apply at: https://about.signpath.io/product/open-source
- Requires: OSS license, public repository

### What You'll Receive

After purchase/approval, you'll get a `.pfx` or `.p12` file and a password. This is your certificate.

## Step 2: Configure Local Builds (Optional)

If you want to build and sign locally:

1. Create a `certs/` folder in the project root
2. Copy your certificate to `certs/cert.pfx`
3. Set environment variable:
   ```powershell
   $env:WIN_CSC_PASSWORD="your-certificate-password"
   ```
4. Build: `npm run build:electron`

The `.gitignore` already excludes `certs/` so you won't accidentally commit it.

## Step 3: Configure GitHub Actions

### 3.1 Convert Certificate to Base64

On Windows PowerShell:
```powershell
$bytes = [System.IO.File]::ReadAllBytes("path\to\your\cert.pfx")
$base64 = [System.Convert]::ToBase64String($bytes)
$base64 | Set-Clipboard
# The base64 string is now in your clipboard
```

On Mac/Linux:
```bash
base64 -i cert.pfx | pbcopy
# or
base64 -i cert.pfx | xclip -selection clipboard
```

### 3.2 Add GitHub Secrets

Go to your GitHub repo → Settings → Secrets and variables → Actions → New repository secret

Add two secrets:

1. **WIN_CSC_LINK**
   - Value: Paste the base64 string from Step 3.1
   - This is your certificate encoded as base64

2. **WIN_CSC_PASSWORD**
   - Value: Your certificate password (plain text)
   - This is used to unlock the certificate during signing

### 3.3 Test the Workflow

The GitHub Actions workflow is already configured. On your next release:

```bash
git tag v1.4.4
git push origin v1.4.4
```

The Windows build will now:
1. Decode the certificate from `WIN_CSC_LINK`
2. Write it to `certs/cert.pfx`
3. Sign the executable using `WIN_CSC_PASSWORD`
4. Upload the signed installer

## Step 4: Verify Signing

### On Windows (after download)

Right-click the `.exe` → Properties → Digital Signatures tab

You should see:
- Signature list with your name/company
- Timestamp (proves when it was signed)
- "This digital signature is OK" message

### On GitHub Release

The `.exe` file should now show "Verified" when downloaded, and SmartScreen won't show the warning (after Microsoft builds reputation for your certificate).

## Important Notes

### Certificate Reputation

**First Few Downloads**: Even with a code-signed app, Windows SmartScreen may still show a warning if your certificate is new. This is normal.

**Building Reputation**: As more users download and run your app without issues, Microsoft's SmartScreen will build a positive reputation. After ~1000-2000 downloads with no issues reported, the warning will stop appearing for most users.

**EV Certificates**: Extended Validation (EV) certificates skip the reputation-building period and are trusted immediately, but cost more ($200-400/year) and require USB token hardware.

### Certificate Expiration

- Standard certificates: Valid for 1-3 years
- You must renew before expiration
- Set a calendar reminder 1 month before expiration
- Old signatures remain valid even after cert expires (timestamped)

### Security Best Practices

- **NEVER commit** certificate files to git (already in `.gitignore`)
- **NEVER share** your certificate password publicly
- Store certificates in a secure password manager
- Rotate certificates annually (or per provider requirements)
- Use GitHub Environment Secrets (not repository secrets) for extra protection in team settings

## Troubleshooting

### "Unknown Publisher" Still Appears

- **Certificate not applied**: Check GitHub Actions logs for signing errors
- **Certificate reputation**: Wait for reputation to build (or upgrade to EV)
- **Wrong cert type**: Ensure it's a "Code Signing" certificate, not SSL/TLS

### Build Fails with Certificate Error

- **Password mismatch**: Verify `WIN_CSC_PASSWORD` is correct
- **Base64 encoding**: Re-encode the certificate and update `WIN_CSC_LINK`
- **Path issues**: Ensure `certs/cert.pfx` path matches `package.json` config

### Mac/Linux Signing

- **Mac**: Requires Apple Developer account ($99/year) + notarization
- **Linux**: No code signing standard (users expect open source to build from source)

## Cost Summary

| Approach | Upfront | Annual | Notes |
|----------|---------|--------|-------|
| **No Signing** | $0 | $0 | SmartScreen warning for all users |
| **Standard Cert** | $100-200 | $100-200 | Warning for first ~1000 downloads |
| **EV Certificate** | $200-400 | $200-400 | No warning, instant trust |
| **SignPath (OSS)** | $0 | $0 | Free if open source, 10 signs/month |

## Next Steps

1. Purchase a certificate (or apply to SignPath for free OSS tier)
2. Convert to base64 and add to GitHub Secrets
3. Test with a new release: `git tag v1.4.4 && git push origin v1.4.4`
4. Verify signature on downloaded `.exe`
5. Monitor reputation building

## References

- [electron-builder Code Signing](https://www.electron.build/code-signing)
- [Microsoft SmartScreen](https://docs.microsoft.com/en-us/windows/security/threat-protection/microsoft-defender-smartscreen/microsoft-defender-smartscreen-overview)
- [SSL.com Code Signing](https://www.ssl.com/code-signing/)
- [SignPath Open Source](https://about.signpath.io/product/open-source)
