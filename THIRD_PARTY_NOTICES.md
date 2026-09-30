# Third-party notices — Pulsaria Beta

Version: 0.1.0-beta.3 · 30 de septiembre de 2026

Pulsaria contains third-party software and data. This file is an inventory
required for a release, not a relicensing of those materials. Each component
keeps its original license and copyright.

## Components included or expected in the Windows bundle

| Component | Version/source | License | Distribution status |
| --- | --- | --- | --- |
| Rust crates | `src-tauri/Cargo.lock` and `cargo metadata` | Cargo license declarations are included in the aggregate release SPDX SBOM | Locked source graph; verify declared licenses against source notices |
| npm packages | `package-lock.json` and `npm sbom` | Exact npm dependency graph and registry license metadata are included in the aggregate release SPDX SBOM | Locked source graph; release SBOM required before publication |
| Python runtime and packages | `src-tauri/resources/runtime-manifest.json` | Python 3.11.9; the aggregate SPDX inventories bundled distribution metadata | Included; manifest PASS (54 required files) |
| Colorama | `colorama` 0.4.6 | BSD-3-Clause; full license text at `python/Lib/site-packages/colorama-0.4.6.dist-info/licenses/LICENSE.txt` in the installed resource tree | Included; exact license file hash is recorded in the aggregate SPDX |
| FFmpeg / FFprobe | `8.1.2-full_build-www.gyan.dev`; exact binary hashes recorded below | GPLv3 build (`--enable-gpl --enable-version3`); license text at `src-tauri/resources/bin/FFMPEG-LICENSE.txt` | Included; corresponding source/build package has not yet been verified for the Beta release |
| yt-dlp | `src-tauri/resources/python/Lib/site-packages/yt_dlp-2026.8.19.dist-info` | Package metadata and runtime manifest | Included; version 2026.8.19 |
| Faster-Whisper | `src-tauri/resources/python/Lib/site-packages/faster_whisper-1.2.1.dist-info` | Package metadata and runtime manifest | Included; version 1.2.1 |
| ONNX Runtime | `src-tauri/resources/python` and Rust dependency | Runtime manifest records version 1.29.0 and binary hashes | Included; version and hashes verified |
| all-MiniLM-L6-v2 | `src-tauri/resources/assets/models/all-MiniLM-L6-v2` | Apache-2.0; upstream model card: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2 | Included; model content hash pinned in runtime manifest |
| llama.cpp | 'src-tauri/resources/bin' | MIT | Included |
| LLVM OpenMP runtime | 'src-tauri/resources/bin/LICENSE-LLVM-OpenMP' | Apache-2.0 with LLVM exceptions | Included |
| Qwen2.5-1.5B-Instruct-GGUF | Downloaded on demand at the pinned revision in `src-tauri/resources/local-llm-manifest.json` | Apache-2.0; `MODEL_NOTICE.md` and manifest | Not bundled; HTTPS, size, revision and SHA-256 checked before use |

The direct-download release job combines npm's production SPDX graph
(`npm sbom --omit=dev`), Cargo's locked metadata, installed Python distribution
metadata and the runtime manifest into one SPDX document. Development-only
packages such as Firebase CLI and its transitive `valid-url` dependency are
excluded from the application inventory.
The runtime manifest is the source of truth for bundled file hashes; it
currently reports 54/54 required files with PASS. Metadata and hashes support
review but do not replace checking each component's license and required
notices against the exact binary that ships.

The aggregate built from this Beta 3 candidate inventories 34 production npm
packages, 695 Cargo packages, 33 bundled Python distributions, 54 runtime
files and 13 packaged legal documents (762 packages and 68 files total). The
Pulsaria package root declares `LicenseRef-Pulsaria-Source-Visible-Beta` and
maps it to the exact text in `LICENSE`; owner review remains pending.

<!-- COMPONENT_LICENSE_REVIEW_PENDING: rights holder must review the custom source license, generated SPDX and exact bundled notices before public release. -->

## Current media and model hashes

### FFmpeg provenance and open review

The bundled binary reports `ffmpeg version 8.1.2-full_build-www.gyan.dev` and its configure output includes `--enable-static`, `--enable-gpl` and `--enable-version3`. The upstream Windows build page lists version 8.1.2 and states that its builds are static and GPLv3: [Gyan.dev FFmpeg builds](https://www.gyan.dev/ffmpeg/builds/). FFmpeg's legal page explains that enabling GPL components places FFmpeg under GPL terms and describes source/build information to review against distributed binaries: [FFmpeg license and legal considerations](https://www.ffmpeg.org/legal.html).

The direct-download workflow currently stages the installer, aggregate SPDX, this file, `LICENSE` and checksums. It does not stage a corresponding FFmpeg source/build package, and no such archive is present in this checkout. The root `LICENSE` and both EULA translations already state that third-party terms control for those components and that the EULA does not restrict their licensed rights. These are useful safeguards, but they do not determine whether the package and source/build materials meet the obligations for this exact binary. The rightsholder must review that boundary and the corresponding source/build obligations before removing `COMPONENT_LICENSE_REVIEW_PENDING` or publishing Beta 3.

The provenance check on 2026-09-28 narrowed the missing materials. The official Gyan page lists 8.1.2 as a previous release and labels its Windows builds static and GPLv3; the Gyan release points to FFmpeg source commit `38b88335f9`. Its uploaded release assets are binary archives for essentials, full and full-shared builds. The GitHub-generated source snapshot for Gyan's `8.1.2` tag contains `README.md` and `.github/FUNDING.yml`, not the FFmpeg build inputs. The official full-build ZIP has SHA-256 `b8cdefab5f50590a076c27c2b56b0294a0e6154faded28ba1ba05ebc4f801f57`; its extracted `bin/ffmpeg.exe` matches the bundled executable byte-for-byte (SHA-256 `AD8F211BC894755E0061C55AB280AE00E8D3D4F15A8CC4372B24CFA247B5942E`). The archive's `README.txt` identifies GPLv3, the FFmpeg commit, the full build configuration, and versions for its external libraries. This confirms the binary's Gyan package provenance and gives a version inventory, but the archive is still a binary package and does not supply those libraries' corresponding source trees. The local binary's `-buildconf` output also confirms `--enable-static`, `--enable-gpl` and `--enable-version3`. The matching binary and build metadata strengthen provenance; source materials and owner/counsel review remain open. This is an evidence gap, not a finding of incompatibility.

Sources checked: [Gyan 8.1.2 release](https://github.com/GyanD/codexffmpeg/releases/tag/8.1.2), [FFmpeg source commit](https://github.com/FFmpeg/FFmpeg/commit/38b88335f9), [Gyan build details](https://www.gyan.dev/ffmpeg/builds/), and [FFmpeg legal page](https://www.ffmpeg.org/legal.html). A 70-row package-version inventory with review status is in [docs/FFMPEG_GYAN_8.1.2_INVENTARIO.md](docs/FFMPEG_GYAN_8.1.2_INVENTARIO.md).

| File or model | Size | SHA-256 |
| --- | ---: | --- |
| `src-tauri/resources/bin/ffmpeg.exe` | 242496512 | `AD8F211BC894755E0061C55AB280AE00E8D3D4F15A8CC4372B24CFA247B5942E` |
| `src-tauri/resources/bin/ffprobe.exe` | 242291712 | `9DF3B0B5275E830961DF6D94E1F7A71121A7ABD5FF708E9FEC8A0B6084A55015` |
| `src-tauri/resources/bin/FFMPEG-LICENSE.txt` | 35147 | `8CEB4B9EE5ADEDDE477B31E975C1D90C73AD27B6B165A1DCD80C7C545EB65B903` |
| `assets/models/all-MiniLM-L6-v2/model.onnx` | 90362391 | `8A8FBFB32594EBF754EC35CC5C60D4B35FD863199C2CAFD09EDBB7FAF6340A80` |
| `assets/models/models--Systran--faster-whisper-tiny` model blob | 75538270 | `DCB76C6586FC06CBDAC6DD21F14CFD129CC4CDD9DCE19BF4FFA62E59CBE6E6D1` |
| Qwen on-demand GGUF | 1117320736 | `6A1A2EB6D15622BF3C96857206351BA97E1AF16C30D7A74EE38970E434E9407E` |

## Verified llama.cpp binary inventory

The Windows CPU x64 sidecar was obtained from the official `b10903` release
archive. The archive SHA-256 is
`b009259d362662f4d73633773080e0ce5d748b8556290b7973fc7249b3b83806`.

| File | Version | License/notice | SHA-256 |
| --- | --- | --- | --- |
| `src-tauri/resources/bin/llama-server.exe` | llama.cpp b10903 | MIT; `llama.cpp/LICENSE` | `1AF9AB68910659812835A797131DA3B72FA22683B10C37443F3B9905D2807413` |
| `src-tauri/resources/bin/llama-server-impl.dll` | llama.cpp b10903 | MIT; `llama.cpp/LICENSE` | `1D3862881BE600A08377D4158D2CEFABCB34C5B793FE309D96CC1BC2C61B445C` |
| `src-tauri/resources/bin/llama-common.dll` | llama.cpp b10903 | MIT; `llama.cpp/LICENSE` | `5F230A43125E88A6AE40B10C65CA4E22632F08FACAD0FB84D38CBFA46A46CE34` |
| `src-tauri/resources/bin/llama.dll` | llama.cpp b10903 | MIT; `llama.cpp/LICENSE` | `2CF4AFFF6EDCBD82F1BF7A8407800563C23491AF31590371DB716A434698AF6F` |
| `src-tauri/resources/bin/ggml.dll` | llama.cpp b10903 | MIT; `llama.cpp/LICENSE` | `375A6AA6333CDA227D40556DE7CCED78ED65B77EA44F501C039BB7FCFB025648` |
| `src-tauri/resources/bin/ggml*.dll` CPU variants | llama.cpp b10903 | MIT; `llama.cpp/LICENSE` | Per-file hashes recorded in `runtime-manifest.json` |
| `src-tauri/resources/bin/mtmd.dll` | llama.cpp b10903 | MIT; `llama.cpp/LICENSE` | `A7AD09DC36D492BD2DE8A28A15A520B64FD2569244E58670F193D15106DDEFCC` |
| `src-tauri/resources/bin/libomp.dll` | LLVM OpenMP runtime | Apache-2.0 with LLVM exceptions; `LICENSE-LLVM-OpenMP` | `A12116BA72D1D6820407CF30BE23DA04CE79D6BB8A71A5EE71759C5A1FAA6F1C` |

The installer location for these notices is the application resource tree;
the public repository carries the same notices at its root. The release
workflow must attach the generated aggregate SBOM and rerun the runtime manifest gate
against the exact tagged build before publication.

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
without a verifiable license blocks the release. The legal gate also requires
the human owner/contact/notice-address fields and explicit approval in
`legal/release-manifest.json`.

## Attribution

The 'llama.cpp' runtime is distributed under its MIT license. The Windows
package also includes the LLVM OpenMP notice. The Qwen model is downloaded
only from the revision declared in
'src-tauri/resources/local-llm-manifest.json' and remains subject to its own
Apache-2.0 license and notice.
