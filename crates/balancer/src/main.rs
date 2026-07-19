//! Warform Commander — Monte-Carlo auto-balancer (Feature 2).
//!
//! Stub reserved by Feature 1: it links the ONE `engine` crate natively and will
//! run `resolve()` thousands of times to read win-probability distributions
//! (never a second engine — that would break P6/P4). Built out in
//! `specs/002-auto-balancer/`.

fn main() {
    println!(
        "Warform Commander balancer (stub) — linked engine v{}",
        engine::engine_version()
    );
}
