use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::RwLock;
use std::time::{Duration, Instant};
use tracing::{info, warn, error};
use metrics::{counter, gauge};

const MAX_FAILURES: usize = 5;
const RESET_TIMEOUT: Duration = Duration::from_secs(30);
const HALF_OPEN_MAX_REQUESTS: usize = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum State {
    Closed,
    Open,
    HalfOpen,
}

pub struct CircuitBreaker {
    failures: AtomicUsize,
    half_open_requests: AtomicUsize,
    state: RwLock<State>,
    last_failure_time: RwLock<Option<Instant>>,
}

impl Default for CircuitBreaker {
    fn default() -> Self {
        Self::new()
    }
}

impl CircuitBreaker {
    pub fn new() -> Self {
        gauge!("whisper_circuit_breaker_state").set(0.0); // 0 = Closed, 1 = Open, 2 = HalfOpen
        Self {
            failures: AtomicUsize::new(0),
            half_open_requests: AtomicUsize::new(0),
            state: RwLock::new(State::Closed),
            last_failure_time: RwLock::new(None),
        }
    }

    pub fn allow_request(&self) -> bool {
        let mut current_state = *self.state.read().unwrap();

        if current_state == State::Open {
            let last_failure = *self.last_failure_time.read().unwrap();
            if let Some(time) = last_failure {
                if time.elapsed() >= RESET_TIMEOUT {
                    let mut state_write = self.state.write().unwrap();
                    if *state_write == State::Open {
                        *state_write = State::HalfOpen;
                        self.half_open_requests.store(0, Ordering::SeqCst);
                        current_state = State::HalfOpen;
                        gauge!("whisper_circuit_breaker_state").set(2.0);
                        info!("circuit_breaker_half_open: Timeout alcanzado, pasando a estado de prueba (Half-Open)");
                    } else {
                        current_state = *state_write;
                    }
                }
            }
        }

        match current_state {
            State::Closed => true,
            State::Open => {
                counter!("whisper_rejected_requests_total").increment(1);
                false
            }
            State::HalfOpen => {
                let requests = self.half_open_requests.fetch_add(1, Ordering::SeqCst);
                if requests < HALF_OPEN_MAX_REQUESTS {
                    true
                } else {
                    counter!("whisper_rejected_requests_total").increment(1);
                    false
                }
            }
        }
    }

    pub fn record_success(&self) {
        let current_state = *self.state.read().unwrap();
        
        self.failures.store(0, Ordering::SeqCst);
        
        if current_state == State::HalfOpen {
            let mut state_write = self.state.write().unwrap();
            if *state_write == State::HalfOpen {
                *state_write = State::Closed;
                gauge!("whisper_circuit_breaker_state").set(0.0);
                info!("circuit_breaker_closed: Las pruebas tuvieron éxito, recuperando servicio (Closed)");
            }
        }
    }

    pub fn record_failure(&self) {
        counter!("whisper_failures_total").increment(1);
        let current_state = *self.state.read().unwrap();

        match current_state {
            State::Closed => {
                let fails = self.failures.fetch_add(1, Ordering::SeqCst) + 1;
                if fails >= MAX_FAILURES {
                    let mut state_write = self.state.write().unwrap();
                    if *state_write == State::Closed {
                        *state_write = State::Open;
                        *self.last_failure_time.write().unwrap() = Some(Instant::now());
                        gauge!("whisper_circuit_breaker_state").set(1.0);
                        error!("circuit_breaker_open: Se alcanzó límite de errores consecutivos ({}) para Whisper Worker", MAX_FAILURES);
                    }
                }
            }
            State::HalfOpen => {
                let mut state_write = self.state.write().unwrap();
                if *state_write == State::HalfOpen {
                    *state_write = State::Open;
                    *self.last_failure_time.write().unwrap() = Some(Instant::now());
                    gauge!("whisper_circuit_breaker_state").set(1.0);
                    warn!("circuit_breaker_open: La prueba falló, regresando a estado abierto (Open)");
                }
            }
            State::Open => {
                *self.last_failure_time.write().unwrap() = Some(Instant::now());
            }
        }
    }
}
