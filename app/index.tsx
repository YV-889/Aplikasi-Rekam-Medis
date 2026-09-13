// Halaman ini SENGAJA kosong/loading saja.
// Expo Router butuh route yang match ke "/" (root) supaya tidak "Unmatched Route".
// Redirect ke login / dashboard yang sebenarnya ditangani oleh logic di app/_layout.tsx.

import { ActivityIndicator, View } from 'react-native';

export default function Index() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
