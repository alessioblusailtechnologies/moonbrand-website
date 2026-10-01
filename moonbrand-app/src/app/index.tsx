import { Redirect } from 'expo-router';

import { useSession } from '../lib/session';
import { Splash } from '../ui/splash';

// L'ingresso: si aspetta di sapere chi c'è, poi accesso, onboarding (senza brand) o le idee.
export default function Index() {
  const { status, brands } = useSession();
  if (status === 'unknown') return <Splash />;
  if (status === 'signed-out') return <Redirect href="/login" />;
  if (brands.length === 0) return <Redirect href="/onboarding" />;
  return <Redirect href="/idee" />;
}
