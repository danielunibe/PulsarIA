//! Canonical packaged-runtime contract.
//!
//! Every bundled executable, worker, model and manifest is resolved below one
//! root.  Development uses `src-tauri/resources`, packaged builds use the
//! `resources` directory next to the executable, and an explicit
//! `PULSAR_RUNTIME_ROOT` is the only supported override.

use std::env;
use std::path::{Path, PathBuf};

pub const RUNTIME_ROOT_ENV: &str = "PULSAR_RUNTIME_ROOT";

/// Resolve the one runtime root used by development, tests and installed
/// bundles.  The executable-relative directory wins when it exists so a
/// release build cannot accidentally read resources from the checkout.
pub fn root() -> PathBuf {
    if let Some(configured) = env::var_os(RUNTIME_ROOT_ENV) {
        let configured = PathBuf::from(configured);
        if configured.is_absolute() {
            return configured;
        }
        if let Ok(current) = env::current_dir() {
            return current.join(configured);
        }
        return configured;
    }

    if let Ok(executable) = env::current_exe() {
        if let Some(parent) = executable.parent() {
            let installed = parent.join("resources");
            if installed.is_dir() {
                return installed;
            }
        }
    }

    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources")
}

pub fn path(relative: impl AsRef<Path>) -> PathBuf {
    root().join(relative)
}

pub fn binary(name: &str) -> PathBuf {
    path("bin").join(name)
}

pub fn python_executable() -> PathBuf {
    let name = if cfg!(windows) {
        "python.exe"
    } else {
        "python"
    };
    path("python").join(name)
}

pub fn worker_script(name: &str) -> PathBuf {
    let staged = path("python-workers").join(name);
    if staged.is_file() || !cfg!(debug_assertions) {
        return staged;
    }
    // Development runs the canonical source directly until Tauri creates its
    // generated staging copy. This is not a second implementation: the
    // bundled path remains the only packaged destination.
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("python-workers")
        .join(name)
}

pub fn embedding_model_dir() -> PathBuf {
    path("assets/models/all-MiniLM-L6-v2")
}

pub fn whisper_model_root() -> PathBuf {
    path("assets/models")
}

#[cfg(test)]
mod tests {
    use super::{embedding_model_dir, path, worker_script};

    #[test]
    fn canonical_paths_are_below_one_root() {
        assert!(embedding_model_dir().ends_with("assets/models/all-MiniLM-L6-v2"));
        assert!(worker_script("main.py").ends_with("python-workers/main.py"));
        assert!(path("runtime-manifest.json").ends_with("runtime-manifest.json"));
    }
}
