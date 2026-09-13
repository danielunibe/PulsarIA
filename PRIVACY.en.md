# Privacy Notice — Pulsaria Beta

Version: 1.0 · September 12, 2026

## Controller

Controller: the rights holder identified in the applicable release.

Privacy address and contact: TO BE COMPLETED BEFORE RELEASE.

This notice is prepared for a desktop beta distributed through GitHub. It
must be reviewed and completed with the controller's real details before
publication.

## Local privacy principle

Pulsaria is designed to process videos, audio, transcripts, embeddings,
searches, and generative-model results locally. Your library content is not
automatically sent to Pulsaria or a remote LLM provider.

The beta does not include usage analytics, telemetry, or remote crash
reporting.

## Data that may be handled on your device

Depending on the features you initiate, the application may create or read:

- URLs and content identifiers;
- video and audio files;
- transcripts, embeddings, and search results;
- file names, local paths, and preferences;
- local technical events and performance metrics;
- browser cookies if you explicitly enable that option;
- local Content Policy acceptance;
- the local model and its integrity metadata.

This data remains in the local paths you configure. You can remove it through
Pulsaria's storage functions or your operating system after making any
backups you need.

## Network connections

The beta may connect to the Internet only to:

- download the local model when you request a feature that needs it;
- check or download a GitHub release or update when you request it;
- access a content URL that you import.
- send the fragments you explicitly include in a manual Gemini synthesis
  request to Google, only if you configured a key in the native process.

The model download does not include videos, audio, transcripts, embeddings, or
user queries. The model is verified locally against the published hash before
use.

## Optional Gemini

Gemini synthesis is disabled by default and does not run during startup,
download, transcription, or search. If you choose the manual “Synthesize with
Gemini” action, Pulsaria sends Google only the prompt and fragments prepared by
that action for the query. The interface discloses this transfer before it is
performed. The key is read only from `PULSAR_GOOGLE_API_KEY` or
`GOOGLE_API_KEY` in the native process; it is not stored in SQLite, preferences,
logs, the bundle, or the frontend. The adapter does not persist the prompt or
response. Review Google's terms and policies before sending sensitive content.

## Browser cookies

Browser-cookie use is disabled by default. If enabled, cookies are used only
for the import operation you requested. Pulsaria must not copy cookies to
SQLite, configuration files, logs, or remote servers.

Do not enable this option on a shared device unless you understand the risk of
exposing a browser session.

## Purposes

Local processing purposes include:

- running features you request;
- maintaining your local library;
- transcribing and indexing content;
- supporting local search and synthesis;
- displaying the states and errors needed to operate the application;
- saving preferences and policy acceptance on the device.

Library content is not automatically used to train remote models or sent to
cloud services. A manual Gemini request is an opt-in exception under your
control.

## Rights and requests

If Pulsaria later receives personal data directly through a support channel,
it will handle access, rectification, cancellation, and objection requests in
accordance with applicable law.

Privacy and ARCO requests: TO BE COMPLETED BEFORE RELEASE.

Do not send videos, transcripts, cookies, or confidential information through
public GitHub issues.

## Security and retention

Pulsaria applies reasonable technical measures to reduce local exposure,
avoids logging complete content in errors, and maintains confidentiality of
information accessed for support. You are responsible for protecting your
device, Windows account, backups, and data directories.

Local retention depends on your settings and available storage. Backups and
their deletion remain your responsibility.

## Changes

This notice may be updated with future versions. The Spanish version controls
for users in Mexico; the English version is an informational translation.
