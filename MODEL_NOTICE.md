# Model notice — Pulsaria Beta

Pulsaria does not include the generative model in the installer. When a user
explicitly requests a local AI feature, the application downloads and verifies
the following pinned model:

- Repository: Qwen/Qwen2.5-1.5B-Instruct-GGUF
- File: qwen2.5-1.5b-instruct-q4_k_m.gguf
- Quantization: Q4_K_M
- License declared by the model repository: Apache-2.0
- Source revision and SHA-256: stored in
  'src-tauri/resources/local-llm-manifest.json'

The model is an independent third-party work. Pulsaria does not claim
ownership of its weights and does not change its license. The model may
produce inaccurate or unsafe output. Users must verify results and must not
use them as professional advice.

The application must not use a model until its expected size, revision, and
SHA-256 have been verified. If the source, license, or hash changes, the
release gate must fail until the notice is reviewed.
