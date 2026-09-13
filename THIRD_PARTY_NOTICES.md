# Third-party notices — Pulsaria Beta

Version: 0.1.0 · 12 de septiembre de 2026

Pulsaria contains third-party software and data. This file is an inventory
required for a release, not a relicensing of those materials. Each component
keeps its original license and copyright.

## Components included or expected in the Windows bundle

| Component | Version/source | License | Distribution status |
| --- | --- | --- | --- |
| Rust crates | 'src-tauri/Cargo.lock' | See generated SBOM | Pending release scan |
| npm packages | 'package-lock.json' | See generated SBOM | Pending release scan |
| Python runtime and packages | 'src-tauri/resources/python' | Individual notices | Included |
| FFmpeg / FFprobe | 'src-tauri/resources/bin' | See 'FFMPEG-LICENSE.txt' | Included |
| yt-dlp | 'python-workers/requirements.txt' | Verify exact shipped build | Included by pipeline |
| Faster-Whisper | 'python-workers/requirements.txt' | Verify exact version | Included by pipeline |
| ONNX Runtime | 'src-tauri/resources/python' and Rust dependency | Individual notice | Included |
| all-MiniLM-L6-v2 | 'src-tauri/resources/assets/models' | Verify model card/license | Included |
| llama.cpp | 'src-tauri/resources/bin' | MIT | Included |
| LLVM OpenMP runtime | 'src-tauri/resources/bin/LICENSE-LLVM-OpenMP' | Apache-2.0 with LLVM exceptions | Included |
| Qwen2.5-1.5B-Instruct-GGUF | Downloaded on demand | Apache-2.0 | Not bundled; verify before use |

## Verified llama.cpp binary inventory

The Windows CPU x64 sidecar was obtained from the official `b10903` release
archive. The archive SHA-256 is
`b009259d362662f4d73633773080e0ce5d748b8556290b7973fc7249b3b83806`.

| File | Version | License/notice | SHA-256 |
| --- | --- | --- | --- |
| `src-tauri/resources/bin/llama-server.exe` | llama.cpp b10903 | MIT; `llama.cpp/LICENSE` | `1AF9AB68910659812835A797131DA3B72FA22683B10C37443F3B9905D2807413` |
| `src-tauri/resources/bin/llama-server-impl.dll` | llama.cpp b10903 | MIT; `llama.cpp/LICENSE` | Verify during release build |
| `src-tauri/resources/bin/llama.dll`, `ggml*.dll`, `mtmd.dll` | llama.cpp b10903 | MIT; `llama.cpp/LICENSE` | Verify during release build |
| `src-tauri/resources/bin/libomp.dll` | LLVM OpenMP runtime | Apache-2.0 with LLVM exceptions; `LICENSE-LLVM-OpenMP` | Verify during release build |

The installer location for these notices is the application resource tree;
the public repository carries the same notices at its root. The release
workflow must replace every “Verify during release build” entry with the
hashes of the exact shipped files and attach the generated SBOM.

## Release procedure

Before each public release, replace the pending entries with a generated SPDX
or CycloneDX SBOM and record:

- exact version and commit;
- SPDX identifier;
- copyright holder;
- source URL;
- whether the component is bundled, downloaded, or development-only;
- required notices and their installer location;
- modifications made by Pulsaria;
- the hash of the shipped binary or model.

An unknown license, missing notice, incompatible copyleft condition, or model
without a verifiable license blocks the release.

## Attribution

The 'llama.cpp' runtime is distributed under its MIT license. The Windows
package also includes the LLVM OpenMP notice. The Qwen model is downloaded
only from the revision declared in
'src-tauri/resources/local-llm-manifest.json' and remains subject to its own
Apache-2.0 license and notice.
