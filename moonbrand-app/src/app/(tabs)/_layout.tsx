import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { colors, fonts } from '../../ui/theme';

type Name = ComponentProps<typeof Feather>['name'];

const icon =
  (name: Name) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Feather name={name} color={color as string} size={size - 2} />;

// Le sezioni dello studio: Assistente, Idee, Contenuti, Piano; in Altro il brand, le conversazioni e l'account.
export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="idee"
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.grey500,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen name="assistente" options={{ title: 'Assistente', tabBarIcon: icon('message-circle') }} />
      <Tabs.Screen name="idee" options={{ title: 'Idee', tabBarIcon: icon('zap') }} />
      <Tabs.Screen name="contenuti" options={{ title: 'Contenuti', tabBarIcon: icon('file-text') }} />
      <Tabs.Screen name="piano" options={{ title: 'Piano', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="altro" options={{ title: 'Altro', tabBarIcon: icon('menu') }} />
    </Tabs>
  );
}
