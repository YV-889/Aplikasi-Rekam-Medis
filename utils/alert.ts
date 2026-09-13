// Alert.alert() bawaan React Native TIDAK jalan dengan baik di web
// (browser) - sering diam-diam tidak menampilkan apa-apa sama sekali.
// Helper ini otomatis pakai window.alert()/window.confirm() kalau di web,
// dan tetap pakai Alert.alert() normal kalau di aplikasi HP (Android/iOS).

import { Alert, Platform } from 'react-native';

export function showAlert(title: string, message?: string) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

export function showConfirm(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmLabel = 'Hapus'
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Batal', style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: onConfirm },
    ]);
  }
}
