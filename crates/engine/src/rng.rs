//! Deterministic seeded PRNG for the core (research A3).
//!
//! [`rand_pcg::Pcg64`] — value-stable **and** portable (tested against reference
//! vectors), unlike `StdRng`/`SmallRng`, which the `rand` book declares non-portable
//! ("may make value-breaking changes in any release"). The crate version is pinned in
//! `Cargo.toml`; the [`reference_vector_is_stable`](tests::reference_vector_is_stable)
//! test + the golden-hash suite (research A5) are the *real* stability contract.
//!
//! **Integer-only draws.** Never sample `usize`/`isize` (width differs 32- vs 64-bit →
//! wasm32 vs native64 divergence) and never a float distribution (routes through
//! platform math). Every draw is an explicit fixed-width integer.

use rand_core::{RngCore, SeedableRng};
use rand_pcg::Pcg64;

use crate::fixed::BP_ONE;

/// The engine's single source of randomness — one per `resolve()`, seeded from the
/// battle's `u64` seed. `Clone` is cheap (two `u128` words) if a snapshot is ever needed.
#[derive(Clone)]
pub struct Rng(Pcg64);

impl Rng {
    /// Seed deterministically from the battle seed. `seed_from_u64` SplitMix64-expands
    /// it internally — portable across native and wasm. Never seed from entropy/time.
    #[inline]
    pub fn from_seed(seed: u64) -> Rng {
        Rng(Pcg64::seed_from_u64(seed))
    }

    /// A raw 32-bit draw (the primitive all other draws build on).
    #[inline]
    pub fn next_u32(&mut self) -> u32 {
        self.0.next_u32()
    }

    /// A uniform integer in `[0, n)` for `n > 0`, via rejection sampling so there is
    /// **no modulo bias**. Integer-only and width-stable (operates on `u32`); the
    /// number of rejections is itself deterministic, so both targets consume the RNG
    /// identically.
    #[inline]
    pub fn below(&mut self, n: u32) -> u32 {
        debug_assert!(n > 0, "below(0) is undefined");
        // reject = 2^32 % n : the count of low values that would bias the modulo.
        let reject = n.wrapping_neg() % n;
        loop {
            let r = self.next_u32();
            if r >= reject {
                return r % n;
            }
        }
    }

    /// A basis-point roll in `[0, 10_000)` — the unit for hit / crit / variance checks.
    /// Convention: `roll_bp() < chance_bp` ⇒ the event fires (research A2/A3).
    #[inline]
    pub fn roll_bp(&mut self) -> i64 {
        self.below(BP_ONE as u32) as i64
    }

    /// A signed variance roll in `[-half, +half]` bp (e.g. `variance_bp(500)` = ±5%).
    #[inline]
    pub fn variance_bp(&mut self, half: i64) -> i64 {
        debug_assert!(half >= 0);
        let span = (half * 2 + 1) as u32; // inclusive range width
        self.below(span) as i64 - half
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_same_sequence() {
        let (mut a, mut b) = (Rng::from_seed(42), Rng::from_seed(42));
        for _ in 0..1_000 {
            assert_eq!(a.next_u32(), b.next_u32());
        }
    }

    #[test]
    fn different_seed_diverges() {
        let (mut a, mut b) = (Rng::from_seed(1), Rng::from_seed(2));
        assert_ne!(a.next_u32(), b.next_u32());
    }

    #[test]
    fn below_is_in_range_and_covers() {
        let mut r = Rng::from_seed(7);
        let mut seen = [false; 6];
        for _ in 0..10_000 {
            let v = r.below(6);
            assert!(v < 6);
            seen[v as usize] = true;
        }
        assert!(seen.iter().all(|&s| s), "every bucket should appear");
    }

    #[test]
    fn roll_bp_in_range() {
        let mut r = Rng::from_seed(9);
        for _ in 0..10_000 {
            assert!((0..10_000).contains(&r.roll_bp()));
        }
    }

    #[test]
    fn variance_bp_in_range_and_symmetric() {
        let mut r = Rng::from_seed(11);
        let (mut lo, mut hi) = (false, false);
        for _ in 0..50_000 {
            let v = r.variance_bp(500);
            assert!((-500..=500).contains(&v));
            lo |= v == -500;
            hi |= v == 500;
        }
        assert!(lo && hi, "range endpoints should be reachable");
    }

    /// Reference-vector guard: the first draws from a fixed seed are pinned. If this
    /// fails after a dependency bump, the PRNG output shifted — investigate, do not
    /// just re-bless the values (research A3/A5: the test is the contract).
    #[test]
    fn reference_vector_is_stable() {
        let mut r = Rng::from_seed(0xDEAD_BEEF);
        let draws = [r.next_u32(), r.next_u32(), r.next_u32(), r.next_u32()];
        assert_eq!(draws, REFERENCE_VECTOR);
    }

    // Locked from the pinned rand_pcg version's actual output for seed 0xDEAD_BEEF.
    // A change here after a dependency bump means determinism shifted — investigate.
    const REFERENCE_VECTOR: [u32; 4] = [2_810_928_398, 77_001_130, 924_029_679, 4_249_500_784];
}
