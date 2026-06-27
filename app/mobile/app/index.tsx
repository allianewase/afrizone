import { Redirect } from 'expo-router';

/**
 * Root entry. The AuthGate in _layout will redirect to the right place once
 * the session is restored; we point here at the tabs by default and let the
 * gate bounce unauthenticated users to (auth)/login.
 */
export default function Index() {
  return <Redirect href="/(tabs)/home" />;
}
