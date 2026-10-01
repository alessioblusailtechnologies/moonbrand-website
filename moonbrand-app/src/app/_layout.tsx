import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { Geist_700Bold } from '@expo-google-fonts/geist/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider, useSession } from '../lib/session';
import { Splash } from '../ui/splash';
import { colors } from '../ui/theme';
import { ToastProvider } from '../ui/toast';

function Routes() {
  const { status, brands } = useSession();
  const signedIn = status === 'signed-in';
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface }, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={status === 'signed-out'}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="onboarding" options={{ animation: 'slide_from_bottom' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && brands.length > 0}>
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="conversazioni" />
        <Stack.Screen name="contenuto/[id]" />
        <Stack.Screen name="brand/[section]" options={{ animation: 'slide_from_bottom' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold });
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {fontsLoaded ? (
          <SessionProvider>
            <ToastProvider>
              <Routes />
            </ToastProvider>
          </SessionProvider>
        ) : (
          <Splash />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
