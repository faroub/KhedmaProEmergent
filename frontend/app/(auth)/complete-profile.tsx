import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { theme } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { useT } from "@/src/language";

type Category = { id: string; name: string; icon: string };

export default function CompleteProfile() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { t } = useT();
  const [fullName, setFullName] = useState("");
  const [city, setCity] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [taskRate, setTaskRate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isProvider = user?.role === "service_provider";

  useEffect(() => {
    api.categories().then((c: any) => setCategories(c)).catch(() => {});
  }, []);

  const submit = async () => {
    if (!fullName.trim()) {
      setError(t("auth.errFill"));
      return;
    }
    if (isProvider && !category) {
      setError(t("auth.errCategory"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: any = { full_name: fullName.trim(), city: city || undefined };
      if (isProvider) {
        payload.category = category;
        payload.bio = bio || undefined;
        payload.hourly_rate = hourlyRate ? parseFloat(hourlyRate) : undefined;
        payload.task_rate = taskRate ? parseFloat(taskRate) : undefined;
      }
      await api.completeProfile(payload);
      await refresh();
      router.replace(isProvider ? "/(provider)/dashboard" : "/(client)/home");
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.iconWrap}>
            <Ionicons name="person-add" size={40} color={theme.colors.brand} />
          </View>
          <Text style={styles.title}>{t("profileC.title")}</Text>
          <Text style={styles.subtitle}>{t("profileC.sub")}</Text>

          <Text style={styles.label}>{t("auth.fullName")}</Text>
          <TextInput
            testID="pc-name-input"
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder={t("auth.fullName")}
            placeholderTextColor={theme.colors.muted}
          />

          <Text style={styles.label}>{t("auth.cityOptional")}</Text>
          <TextInput
            testID="pc-city-input"
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder="Algiers"
            placeholderTextColor={theme.colors.muted}
          />

          {isProvider && (
            <>
              <Text style={styles.sectionLabel}>{t("auth.category")}</Text>
              <View style={styles.categoryGrid}>
                {categories.map((c) => (
                  <Pressable
                    key={c.id}
                    testID={`pc-cat-${c.id}`}
                    onPress={() => setCategory(c.id)}
                    style={[styles.catChip, category === c.id && styles.catChipActive]}
                  >
                    <Ionicons name={c.icon as any} size={14} color={category === c.id ? theme.colors.onBrandPrimary : theme.colors.brand} />
                    <Text style={[styles.catChipText, category === c.id && styles.catChipTextActive]}>{t(`cat.${c.id}`)}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>{t("auth.bio")}</Text>
              <TextInput
                testID="pc-bio-input"
                style={[styles.input, { height: 90, textAlignVertical: "top" }]}
                value={bio}
                onChangeText={setBio}
                multiline
                placeholder={t("auth.bioPh")}
                placeholderTextColor={theme.colors.muted}
              />

              <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t("auth.hourlyRate")}</Text>
                  <TextInput testID="pc-hourly-input" style={styles.input} value={hourlyRate} onChangeText={setHourlyRate} keyboardType="numeric" placeholder="800" placeholderTextColor={theme.colors.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t("auth.taskRate")}</Text>
                  <TextInput testID="pc-task-input" style={styles.input} value={taskRate} onChangeText={setTaskRate} keyboardType="numeric" placeholder="3000" placeholderTextColor={theme.colors.muted} />
                </View>
              </View>

              <View style={styles.trialBanner}>
                <Ionicons name="gift" size={18} color={theme.colors.brand} />
                <Text style={styles.trialText}>{t("auth.trial")}</Text>
              </View>
            </>
          )}

          {error && <Text style={styles.error} testID="pc-error">{error}</Text>}

          <Pressable
            testID="pc-submit-btn"
            onPress={submit}
            disabled={submitting}
            style={[styles.primaryBtn, submitting && { opacity: 0.7 }]}
          >
            {submitting ? <ActivityIndicator color={theme.colors.onBrandPrimary} /> : <Text style={styles.primaryBtnText}>{t("profileC.save")}</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl, gap: theme.spacing.md },
  iconWrap: {
    alignSelf: "center", width: 72, height: 72, borderRadius: 36,
    backgroundColor: theme.colors.brandTertiary,
    alignItems: "center", justifyContent: "center", marginTop: theme.spacing.md,
  },
  title: { color: theme.colors.onSurface, fontSize: 24, fontWeight: "800", textAlign: "center", marginTop: theme.spacing.md },
  subtitle: { color: theme.colors.onSurfaceSecondary, fontSize: 14, textAlign: "center", marginBottom: theme.spacing.md },
  label: { color: theme.colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  sectionLabel: { color: theme.colors.onSurface, fontWeight: "700", marginTop: theme.spacing.sm, fontSize: 15 },
  input: {
    backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg, paddingVertical: 14, fontSize: 16,
    color: theme.colors.onSurface, borderWidth: 1, borderColor: theme.colors.border,
  },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: theme.spacing.md, paddingVertical: 10,
    borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  catChipActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  catChipText: { color: theme.colors.onSurface, fontSize: 13, fontWeight: "600" },
  catChipTextActive: { color: theme.colors.onBrandPrimary },
  trialBanner: {
    flexDirection: "row", alignItems: "center", gap: theme.spacing.sm,
    padding: theme.spacing.md, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.brandTertiary, marginTop: theme.spacing.sm,
  },
  trialText: { color: theme.colors.onBrandTertiary, flex: 1, fontSize: 13 },
  primaryBtn: {
    backgroundColor: theme.colors.brand, paddingVertical: 16,
    borderRadius: theme.radius.pill, alignItems: "center", marginTop: theme.spacing.md,
  },
  primaryBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  error: { color: theme.colors.error, fontSize: 14, textAlign: "center" },
});
