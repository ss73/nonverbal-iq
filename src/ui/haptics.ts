/** Haptic feedback in the native app only; the web version stays silent (no vibration). */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const native = Capacitor.isNativePlatform();

/** A light tap, e.g. when choosing an answer. */
export function tap(): void {
  if (native) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

/** A completion pattern, e.g. when a test is submitted. */
export function done(): void {
  if (native) Haptics.notification({ type: NotificationType.Success }).catch(() => {});
}
