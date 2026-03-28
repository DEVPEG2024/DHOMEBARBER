import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard } from '@capacitor/keyboard';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Browser } from '@capacitor/browser';

/**
 * Returns true if running inside a native Capacitor shell (iOS/Android)
 */
export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

/**
 * Initialize native plugins — call once at app startup
 */
export async function initCapacitor() {
  if (!isNative) return;

  // Status bar
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    if (platform === 'android') {
      await StatusBar.setBackgroundColor({ color: '#1a1a2e' });
    }
  } catch {}

  // Hide splash screen after app is ready
  try {
    await SplashScreen.hide();
  } catch {}

  // Keyboard: scroll into view on focus (iOS)
  if (platform === 'ios') {
    try {
      Keyboard.addListener('keyboardWillShow', () => {
        document.body.classList.add('keyboard-open');
      });
      Keyboard.addListener('keyboardWillHide', () => {
        document.body.classList.remove('keyboard-open');
      });
    } catch {}
  }

  // Handle back button on Android
  if (platform === 'android') {
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });
  }

  // Handle deep links
  App.addListener('appUrlOpen', (event) => {
    const url = new URL(event.url);
    if (url.pathname) {
      window.location.hash = url.pathname;
    }
  });
}

/**
 * Haptic feedback — uses native Capacitor plugin on iOS/Android, falls back to navigator.vibrate
 */
export async function hapticFeedback() {
  if (isNative) {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
  } else if (navigator.vibrate) {
    navigator.vibrate(50);
  }
}

/**
 * Open external URL — uses native in-app browser on iOS/Android, falls back to window.open
 */
export async function openExternalUrl(url) {
  if (isNative) {
    try {
      await Browser.open({ url });
    } catch {}
  } else {
    window.open(url, '_blank');
  }
}
