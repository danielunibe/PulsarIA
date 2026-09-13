# Pulsaria public beta release compliance

This checklist is a release gate for the free beta. It does not replace legal
advice or a signed review by the rights holder and counsel.

## Required before a public tag

- [ ] Clean, reviewed checkout; no unrelated worktree changes.
- [ ] Canonical public name is Pulsaria.
- [ ] Full legal name, notice address, and contact email are present.
- [ ] Source-visible proprietary license reviewed.
- [ ] EULA, Terms, Privacy, Content, Copyright, and Security documents are
      present in Spanish and English where applicable.
- [ ] Spanish version controls for Mexican users.
- [ ] Ownership and contributor provenance reviewed privately.
- [ ] No contractor, employer, client, university, or generated asset has
      unresolved ownership.
- [ ] SPDX/CycloneDX SBOM generated from the release candidate.
- [ ] Third-party notices include every shipped binary, runtime, package,
      font, icon, and model.
- [ ] Model revision, size, license, URL, and SHA-256 are pinned.
- [ ] No MIT license grant is unintentionally retained for the new release.
- [ ] Full-history secret scan is clean.
- [ ] No credentials, cookies, databases, private media, or personal data are
      in the repository or release artifacts.
- [ ] Any optional Gemini integration is native-only, opt-in, disclosed in the
      UI/privacy notice, and has no public key or direct frontend endpoint.
- [ ] Zero-telemetry claim verified by network inspection.
- [ ] Content-rights acknowledgement blocks URL import until accepted.
- [ ] TikTok/YouTube wording does not promise unrestricted downloading.
- [ ] Platform terms and content-risk review completed for target regions.
- [ ] Local model download uses HTTPS, temporary files, atomic rename, and
      SHA-256 verification.
- [ ] Local sidecar binds only to 127.0.0.1 and has no filesystem tools.
- [ ] Authenticode signature, timestamp, updater signature, and hashes pass.
- [ ] Clean-install, upgrade, rollback, and data-preservation checks pass.
- [ ] Legal review recorded outside the public repository.

## Status vocabulary

Use PASS, PARTIAL, FAIL, or BLOCKED_EXTERNAL. Compilation and tests do not
imply legal, visual, installer, signing, or platform acceptance.
