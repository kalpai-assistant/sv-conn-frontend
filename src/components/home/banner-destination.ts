/**
 * Where tapping a home-screen promotional banner takes the user.
 *
 * Shared by ``HeroBanner`` (occasional, full-width festival/campaign slot)
 * and ``PromoCarousel`` (always-on horizontal card strip) so a new
 * destination ``kind`` added for one is automatically supported by the
 * other — the "coupon tap handler lives in two places" bug from SVC-310
 * stays fixed as the shape grows.
 *
 * Discriminated by ``kind`` rather than sniffing ``value`` — the renderer
 * can switch on ``kind`` directly without regex-matching URL shapes,
 * which was how the pre-SVC-310 code decided (badly) what to do with
 * ``ctaTo``.
 */
export type BannerDestination =
  | { kind: "coupon"; value: string }
  | { kind: "route"; value: string }
  | { kind: "external"; value: string };
