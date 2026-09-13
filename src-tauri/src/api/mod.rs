pub mod gateway;
pub mod middleware;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};

/// Runtime state shared by the REST gateway and the native health command.
///
/// Binding the loopback port happens asynchronously during startup. Keeping
/// the result here prevents the UI from treating a failed bind as a healthy
/// backend merely because the Tauri process itself launched.
#[derive(Clone, Default)]
pub struct ApiRuntimeState {
    ready: Arc<AtomicBool>,
    last_error: Arc<RwLock<Option<String>>>,
}

impl ApiRuntimeState {
    pub fn mark_ready(&self) {
        self.ready.store(true, Ordering::SeqCst);
        if let Ok(mut last_error) = self.last_error.write() {
            *last_error = None;
        }
    }

    pub fn mark_failed(&self, error: String) {
        self.ready.store(false, Ordering::SeqCst);
        if let Ok(mut last_error) = self.last_error.write() {
            *last_error = Some(error);
        }
    }

    pub fn snapshot(&self) -> (bool, Option<String>) {
        let error = self.last_error.read().ok().and_then(|value| value.clone());
        (self.ready.load(Ordering::SeqCst), error)
    }
}
