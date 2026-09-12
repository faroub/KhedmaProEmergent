import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";
import { LogBox, Platform, StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AuthProvider } from "@/src/auth";
import { LanguageProvider } from "@/src/language";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

// --- Push notifications (module scope; runs before any component) ---
if (Platform.OS !== "web") {
  // Foreground behavior — show banner/sound/no badge when a push arrives while app is open.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

if (Platform.OS === "android") {
  // Create the default channel BEFORE any push can arrive.
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#0EA5A4",
  });
}

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;

    // Route helper — deep-links or expo-router paths.
    const openTarget = (url?: string | null) => {
      if (!url) return;
      if (url.startsWith("http")) {
        Linking.openURL(url).catch(() => {});
      } else {
        try {
          router.push(url as any);
        } catch {}
      }
    };

    // Warm tap — app open in foreground/background.
    const tapSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = (response.notification.request.content.data || {}) as any;
        openTarget(data.deeplink || data.action_url);
      }
    );

    // Cold-start tap — app was killed and user tapped a notification.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        const data = (response.notification.request.content.data || {}) as any;
        openTarget(data.deeplink || data.action_url);
      })
      .catch(() => {});

    // Weekly nudge when permission is permanently denied.
    (async () => {
      try {
        const { status, canAskAgain } = await Notifications.getPermissionsAsync();
        if (status !== "denied" || canAskAgain) return;
        const lastNudge = await AsyncStorage.getItem("pushNudgeAt");
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        if (lastNudge && Date.now() - Number(lastNudge) <= oneWeek) return;
        // Stamp immediately so we don't nag; on next surface the app UI can
        // present a settings CTA. We do NOT auto-open settings here.
        await AsyncStorage.setItem("pushNudgeAt", String(Date.now()));
      } catch {}
    })();

    return () => {
      try {
        tapSub.remove();
      } catch {}
    };
  }, [router]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0B1120" }}>
      <SafeAreaProvider>
        <LanguageProvider>
          <AuthProvider>
            <StatusBar barStyle="light-content" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0B1120" } }} />
          </AuthProvider>
        </LanguageProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
