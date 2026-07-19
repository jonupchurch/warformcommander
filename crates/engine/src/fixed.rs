//! Fixed-point arithmetic for the deterministic core (research A2).
//!
//! **No floats anywhere in the sim** — native and wasm32 must agree byte-for-byte
//! (research A1), and IEEE-754 across those targets does not. So every quantity is
//! an integer:
//!
//! - **Quantities** (hull, shields, damage, support) are **milli-units** (scale
//!   1000) held in the [`Fixed`] newtype — e.g. hull `1700` is `Fixed(1_700_000)`.
//! - **Fractions / multipliers** (accuracy, evasion, armor %, splash, crit mult,
//!   the damage-type × defense matrix) are **basis points** (scale 10_000, so
//!   `1.0 = 10_000`, `1.4 = 14_000`, `0.85 = 8_500`) applied with [`Fixed::mul_bp`].
//!
//! **Rounding rule (fixed once, tested):** `mul_bp` truncates toward zero (matching
//! Rust integer `/`). Every product widens to `i128` first, so nothing overflows at
//! sim magnitudes (hull ≤ ~2_000_000 milli-units, bp ≤ ~20_000). Add/sub saturate,
//! so debug (panic-on-overflow) and release (wrap) can never diverge — a determinism
//! footgun closed (research A4 rule 6). Because the state is integer-only it is
//! `Eq`/`Ord`/`Hash`, which is what makes a whole `Replay` trivially and
//! deterministically hashable for the golden-hash test (research A5).

/// Milli-unit scale: one whole unit = `1000` `Fixed` counts.
pub const SCALE: i64 = 1_000;

/// Basis-point scale: `1.0` (100%) = `10_000` bp.
pub const BP_ONE: i64 = 10_000;

/// A fixed-point quantity in milli-units (scale [`SCALE`]). Integer-only and total-order.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug, Default, Hash)]
pub struct Fixed(pub i64);

impl Fixed {
    /// Additive identity.
    pub const ZERO: Fixed = Fixed(0);

    /// From a whole number of units: `from_int(1700) == Fixed(1_700_000)`.
    #[inline]
    pub const fn from_int(n: i64) -> Fixed {
        Fixed(n * SCALE)
    }

    /// From raw milli-units (when a value already carries sub-unit precision).
    #[inline]
    pub const fn from_milli(m: i64) -> Fixed {
        Fixed(m)
    }

    /// Raw milli-unit representation.
    #[inline]
    pub const fn milli(self) -> i64 {
        self.0
    }

    /// Whole units, truncated toward zero — for display / integer readouts only.
    #[inline]
    pub const fn to_int(self) -> i64 {
        self.0 / SCALE
    }

    /// Multiply by a basis-point fraction (`10_000` = ×1.0), truncating toward zero.
    /// Widens to `i128` so the product cannot overflow at sim magnitudes.
    #[inline]
    pub fn mul_bp(self, bp: i64) -> Fixed {
        Fixed(((self.0 as i128 * bp as i128) / BP_ONE as i128) as i64)
    }

    /// Saturating add (never overflows / panics — keeps debug == release).
    #[inline]
    pub fn saturating_add(self, other: Fixed) -> Fixed {
        Fixed(self.0.saturating_add(other.0))
    }

    /// Saturating subtract.
    #[inline]
    pub fn saturating_sub(self, other: Fixed) -> Fixed {
        Fixed(self.0.saturating_sub(other.0))
    }

    /// Clamp below at zero (hull / shield floors).
    #[inline]
    pub fn max_zero(self) -> Fixed {
        Fixed(self.0.max(0))
    }

    /// The larger of two quantities.
    #[inline]
    pub fn max(self, other: Fixed) -> Fixed {
        Fixed(self.0.max(other.0))
    }

    /// The smaller of two quantities.
    #[inline]
    pub fn min(self, other: Fixed) -> Fixed {
        Fixed(self.0.min(other.0))
    }

    /// True once the quantity is at or below zero (e.g. a machine is destroyed).
    #[inline]
    pub const fn is_zero_or_less(self) -> bool {
        self.0 <= 0
    }
}

// Operator sugar. Add/sub **saturate** deliberately (see module docs): a subtraction
// that would underflow floors at i64::MIN rather than wrapping, so the two build
// profiles can never produce different bytes.
impl core::ops::Add for Fixed {
    type Output = Fixed;
    #[inline]
    fn add(self, o: Fixed) -> Fixed {
        self.saturating_add(o)
    }
}

impl core::ops::Sub for Fixed {
    type Output = Fixed;
    #[inline]
    fn sub(self, o: Fixed) -> Fixed {
        self.saturating_sub(o)
    }
}

/// Clamp a raw basis-point value into `[lo, hi]` — e.g. hit chance into `[500, 9500]`
/// (`clamp(acc − evasion, 0.05, 0.95)`; research/stat-block §1).
#[inline]
pub fn clamp_bp(bp: i64, lo: i64, hi: i64) -> i64 {
    bp.clamp(lo, hi)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn int_roundtrip() {
        assert_eq!(Fixed::from_int(1700).milli(), 1_700_000);
        assert_eq!(Fixed::from_int(1700).to_int(), 1700);
        assert_eq!(Fixed::from_milli(87_500).to_int(), 87); // truncates toward zero
    }

    #[test]
    fn mul_bp_identity_and_matrix() {
        let h = Fixed::from_int(1700);
        assert_eq!(h.mul_bp(BP_ONE), h); // ×1.0 is identity
        // Damage-type × defense matrix as basis points (stat-block §1):
        assert_eq!(h.mul_bp(14_000), Fixed::from_int(2380)); // Kinetic ×1.4 vs shields
        assert_eq!(h.mul_bp(8_500), Fixed::from_int(1445)); // Kinetic ×0.85 vs armor
        assert_eq!(h.mul_bp(6_000), Fixed::from_int(1020)); // Energy ×0.6 vs shields
        assert_eq!(h.mul_bp(12_500), Fixed::from_int(2125)); // Energy ×1.25 vs armor
    }

    #[test]
    fn mul_bp_truncates_toward_zero() {
        // 1001 milli × 0.5 = 500.5 milli -> truncates to 500.
        assert_eq!(Fixed::from_milli(1001).mul_bp(5_000), Fixed::from_milli(500));
    }

    #[test]
    fn damage_pipeline_shape_matches_design() {
        // hullDmg = max(hullIn × armorMult × (1 − armorPct), hullIn × 0.10)  (§9.2)
        let hull_in = Fixed::from_int(100);
        let energy_vs_armor = 12_500; // ×1.25
        let one_minus_armor_pct = 7_000; // (1 − 0.30) = 0.70
        let mitigated = hull_in.mul_bp(energy_vs_armor).mul_bp(one_minus_armor_pct);
        let floor = hull_in.mul_bp(1_000); // 10% min-damage floor
        assert_eq!(mitigated, Fixed::from_int(87).saturating_add(Fixed::from_milli(500)));
        assert_eq!(floor, Fixed::from_int(10));
        assert_eq!(mitigated.max(floor), mitigated); // the mitigated hit clears the floor
    }

    #[test]
    fn variance_via_basis_points() {
        // ±5% damage variance: roll r ∈ [-500, 500] bp, apply (10_000 + r).
        let dmg = Fixed::from_int(200);
        assert_eq!(dmg.mul_bp(10_500), Fixed::from_int(210)); // +5%
        assert_eq!(dmg.mul_bp(9_500), Fixed::from_int(190)); // -5%
    }

    #[test]
    fn saturating_sub_floors_and_is_zero_detects_death() {
        let hull = Fixed::from_int(50);
        let over = Fixed::from_int(80);
        assert_eq!(hull.saturating_sub(over).max_zero(), Fixed::ZERO);
        assert!((hull - over).max_zero().is_zero_or_less());
        assert!(!Fixed::from_int(1).is_zero_or_less());
    }

    #[test]
    fn no_overflow_at_sim_magnitudes() {
        // Largest realistic hull × largest realistic multiplier must not panic/overflow.
        let big = Fixed::from_int(2_500); // beyond any variant's hull
        let hit = big.mul_bp(20_000); // ×2.0, beyond any multiplier
        assert_eq!(hit, Fixed::from_int(5_000));
    }

    #[test]
    fn multiplier_chain_order_is_fixed_and_documented() {
        // Integer division rounds, so mul_bp is order-sensitive; the pipeline order
        // is fixed in code (shield -> armor -> variance -> crit). Prove the chosen
        // order is stable and reproduces exactly.
        let x = Fixed::from_milli(12_345);
        let a = x.mul_bp(8_500).mul_bp(12_500);
        // Recompute the same order -> identical (determinism), independent of run.
        assert_eq!(a, x.mul_bp(8_500).mul_bp(12_500));
    }

    #[test]
    fn hit_chance_clamp() {
        assert_eq!(clamp_bp(9_999, 500, 9_500), 9_500); // clamps high
        assert_eq!(clamp_bp(100, 500, 9_500), 500); // clamps low
        assert_eq!(clamp_bp(8_000, 500, 9_500), 8_000); // within range
    }
}
