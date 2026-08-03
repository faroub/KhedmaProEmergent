import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable,
  FlatList, ActivityIndicator, RefreshControl, ImageBackground,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";
import { WilayaPicker } from "@/src/WilayaPicker";
import { type DropdownOption } from "@/src/Dropdown";
import { FiltersSheet, FiltersPill } from "@/src/FiltersSheet";
import { getClientLocation, peekLocationCache, type Coords } from "@/src/utils/location";

// Radius presets in kilometers. "wilaya" and "country" are sentinel scopes.
type ScopeKey = "2" | "5" | "10" | "25" | "50" | "wilaya" | "country";
const SCOPE_PRESETS: { key: ScopeKey; km?: number }[] = [
  { key: "2", km: 2 },
  { key: "5", km: 5 },
  { key: "10", km: 10 },
  { key: "25", km: 25 },
  { key: "50", km: 50 },
  { key: "wilaya" },
  { key: "country" },
];

type Category = { id: string; name: string; icon: string };
type Provider = {
  id: string; full_name: string; category?: string; hourly_rate?: number;
  task_rate?: number; city?: string; avatar_url?: string; rating: number;
  reviews_count: number; bio?: string;
  distance_km?: number | null;
};

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const { t, isRTL } = useT();
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [wilayaCode, setWilayaCode] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Default: "Near me" 5 km. On first GPS attempt we fall back to wilaya/country if denied.
  const [scope, setScope] = useState<ScopeKey>("5");
  const [coords, setCoords] = useState<Coords | null>(peekLocationCache());
  const [locationDenied, setLocationDenied] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Resolve GPS lazily the first time a radius scope is active. If permission
  // is denied, fall back to the user's profile wilaya (or All Algeria).
  useEffect(() => {
    const km = SCOPE_PRESETS.find((p) => p.key === scope)?.km;
    if (km == null) return;               // "wilaya" / "country" scopes don't need GPS
    if (coords) return;                    // already have it
    (async () => {
      const c = await getClientLocation();
      if (c) {
        setCoords(c);
        setLocationDenied(false);
      } else {
        setLocationDenied(true);
        // Auto-fallback: user's own wilaya if set, else whole country.
        if (user?.wilaya_code) {
          setScope("wilaya");
          setWilayaCode(user.wilaya_code);
        } else {
          setScope("country");
        }
      }
    })();
  }, [scope, coords, user?.wilaya_code]);

  const load = useCallback(async () => {
    try {
      const km = SCOPE_PRESETS.find((p) => p.key === scope)?.km;
      const useRadius = km != null && coords != null;
      const [cats, provs] = await Promise.all([
        api.categories(),
        api.providers({
          category: selectedCat || undefined,
          search: search || undefined,
          wilaya: scope === "wilaya" ? (wilayaCode || undefined) : undefined,
          lat: useRadius ? coords!.lat : undefined,
          lng: useRadius ? coords!.lng : undefined,
          radius_km: useRadius ? km : undefined,
        }),
      ]);
      setCategories(cats as any);
      setProviders(provs as any);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCat, search, wilayaCode, scope, coords]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const featured = useMemo(() => providers.slice(0, 5), [providers]);
  const displayed = useMemo(
    () => (verifiedOnly ? providers.filter((p: any) => p.is_verified) : providers),
    [providers, verifiedOnly]
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>
            {user ? `${t("home.hello")}, ${user.full_name?.split(" ")[0]}` : t("home.helloGuest")}
          </Text>
          <View style={styles.locRow}>
            <Ionicons name="location" size={14} color={theme.colors.brand} />
            <Text style={styles.locText}>{user?.city || "Algeria"}</Text>
          </View>
        </View>
        {user ? (
          <Pressable style={styles.bell} onPress={() => router.push("/(client)/bookings")} testID="header-bookings-btn">
            <Ionicons name="calendar-outline" size={22} color={theme.colors.onSurface} />
          </Pressable>
        ) : (
          <Pressable style={styles.signInBtn} onPress={() => router.push("/(auth)/login")} testID="header-signin-btn">
            <Text style={styles.signInText}>{t("home.headerSignIn")}</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: theme.spacing.xxxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.brand} />}
      >
        <View style={styles.searchRow}>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={theme.colors.muted} />
            <TextInput
              testID="search-input"
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={t("home.searchPlaceholder")}
              placeholderTextColor={theme.colors.muted}
              returnKeyType="search"
            />
          </View>
          <FiltersPill
            testID="filters-pill"
            activeCount={
              (scope !== "5" ? 1 : 0) + (selectedCat ? 1 : 0) + (verifiedOnly ? 1 : 0)
            }
            label={t("filters.title")}
            onPress={() => setFiltersOpen(true)}
          />
        </View>

        {locationDenied && SCOPE_PRESETS.find((p) => p.key === scope)?.km != null && (
          <View style={styles.locHint} testID="location-denied-hint">
            <Ionicons name="information-circle-outline" size={14} color={theme.colors.warning} />
            <Text style={styles.locHintText}>{t("home.locationDenied")}</Text>
          </View>
        )}

        {scope === "wilaya" && (
          <View style={{ paddingHorizontal: theme.spacing.xl, marginTop: theme.spacing.md, flexDirection: "row", gap: theme.spacing.sm }}>
            <WilayaPicker
              testID="home-wilaya-picker"
              compact
              value={wilayaCode}
              onSelect={(code) => setWilayaCode(code)}
              label={t("wilaya.filterAll")}
            />
            {wilayaCode && (
              <Pressable testID="clear-wilaya-btn" onPress={() => setWilayaCode(null)} style={{
                paddingHorizontal: 10, height: 36, borderRadius: theme.radius.pill,
                borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center",
              }}>
                <Ionicons name="close" size={16} color={theme.colors.muted} />
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.promoWrap}>
          <ImageBackground
            source={{ uri: "https://images.unsplash.com/photo-1687463221023-02f259da7d77?w=800" }}
            style={styles.promo}
            imageStyle={{ borderRadius: theme.radius.lg }}
          >
            <LinearGradient
              colors={["rgba(11,17,32,0.2)", "rgba(11,17,32,0.85)"]}
              style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.lg }]}
            />
            <View style={styles.promoContent}>
              <Text style={styles.promoBadge}>{t("home.promoBadge")}</Text>
              <Text style={styles.promoTitle}>{t("home.promoTitle")}</Text>
              <Text style={styles.promoSub}>{t("home.promoSub")}</Text>
            </View>
          </ImageBackground>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{selectedCat ? t(`cat.${selectedCat}`) : t("home.categories")}</Text>
        </View>

        {featured.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t("home.topRated")}</Text>
            </View>
            <FlatList
              horizontal
              data={featured}
              keyExtractor={(p) => p.id}
              contentContainerStyle={{ paddingHorizontal: theme.spacing.xl, gap: theme.spacing.md }}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <Pressable
                  testID={`featured-${item.id}`}
                  style={styles.featuredCard}
                  onPress={() => router.push(`/provider/${item.id}`)}
                >
                  <Image
                    source={{ uri: item.avatar_url || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400" }}
                    style={styles.featuredImg}
                    contentFit="cover"
                  />
                  <LinearGradient
                    colors={["transparent", "rgba(11,17,32,0.95)"]}
                    style={styles.featuredScrim}
                  />
                  <View style={styles.featuredInfo}>
                    <View style={styles.ratingPill}>
                      <Ionicons name="star" size={11} color={theme.colors.brand} />
                      <Text style={styles.ratingPillText}>{item.rating.toFixed(1)}</Text>
                    </View>
                    <Text style={styles.featuredName} numberOfLines={1}>{item.full_name}</Text>
                    <Text style={styles.featuredCat} numberOfLines={1}>
                      {item.category ? t(`cat.${item.category}`) : ""}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
          </>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("home.allProviders")}</Text>
          <Text style={styles.sectionCount}>{displayed.length}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xl }} />
        ) : displayed.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={40} color={theme.colors.muted} />
            <Text style={styles.emptyText}>{t("home.noResults")}</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: theme.spacing.xl, gap: theme.spacing.md }}>
            {displayed.map((p) => (
              <Pressable
                key={p.id}
                testID={`provider-${p.id}`}
                style={styles.providerRow}
                onPress={() => router.push(`/provider/${p.id}`)}
              >
                <Image
                  source={{ uri: p.avatar_url || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200" }}
                  style={styles.providerAvatar}
                  contentFit="cover"
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.providerName} numberOfLines={1}>{p.full_name}</Text>
                  <Text style={styles.providerCat} numberOfLines={1}>
                    {p.category ? t(`cat.${p.category}`) : ""} • {p.city || ""}
                  </Text>
                  <View style={styles.providerMeta}>
                    <Ionicons name="star" size={12} color={theme.colors.brand} />
                    <Text style={styles.providerRating}>{p.rating.toFixed(1)}</Text>
                    <Text style={styles.providerReviews}>({p.reviews_count})</Text>
                    <View style={styles.dot} />
                    <Text style={styles.providerRate}>{p.hourly_rate ?? "-"} {t("provider.perHour")}</Text>
                    {p.distance_km != null && (
                      <>
                        <View style={styles.dot} />
                        <Ionicons name="navigate" size={11} color={theme.colors.brand} />
                        <Text style={styles.providerDistance}>
                          {p.distance_km < 1
                            ? t("home.distanceMeters", { m: Math.round(p.distance_km * 1000) })
                            : t("home.distanceKm", { km: p.distance_km.toFixed(1) })}
                        </Text>
                      </>
                    )}
                  </View>
                </View>
                <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={20} color={theme.colors.muted} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <FiltersSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        state={{ scope, category: selectedCat, verifiedOnly }}
        scopeOptions={SCOPE_PRESETS.map<DropdownOption>((p) => ({
          value: p.key,
          label:
            p.key === "wilaya"
              ? t("home.scope.wilaya")
              : p.key === "country"
              ? t("home.scope.country")
              : t("home.scope.km", { km: p.km! }),
          icon:
            p.key === "country"
              ? "flag-outline"
              : p.key === "wilaya"
              ? "map-outline"
              : "locate-outline",
        }))}
        categoryOptions={categories.map<DropdownOption>((c) => ({
          value: c.id,
          label: t(`cat.${c.id}`),
          icon: c.icon as any,
        }))}
        onApply={(next) => {
          const key = (next.scope || "5") as ScopeKey;
          setScope(key);
          if (key !== "wilaya") setWilayaCode(null);
          setSelectedCat(next.category);
          setVerifiedOnly(!!next.verifiedOnly);
        }}
        onReset={() => {
          setScope("5");
          setSelectedCat(null);
          setVerifiedOnly(false);
          setWilayaCode(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.md,
  },
  hello: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "700" },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  locText: { color: theme.colors.onSurfaceSecondary, fontSize: 13 },
  bell: {
    width: 40, height: 40, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: theme.colors.border,
  },
  signInBtn: {
    paddingHorizontal: theme.spacing.md, height: 40,
    borderRadius: theme.radius.pill, backgroundColor: theme.colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  signInText: { color: theme.colors.onBrandPrimary, fontWeight: "700", fontSize: 13 },
  searchWrap: {
    flex: 1,
    flexDirection: "row", alignItems: "center", gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border,
  },
  searchInput: { flex: 1, color: theme.colors.onSurface, paddingVertical: 12, fontSize: 15 },
  promoWrap: { paddingHorizontal: theme.spacing.xl, marginTop: theme.spacing.lg },
  promo: { height: 150, borderRadius: theme.radius.lg, overflow: "hidden", justifyContent: "flex-end" },
  promoContent: { padding: theme.spacing.lg },
  promoBadge: {
    color: theme.colors.onBrandPrimary, backgroundColor: theme.colors.brand,
    fontWeight: "800", fontSize: 10, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: theme.radius.sm, alignSelf: "flex-start", marginBottom: 8,
  },
  promoTitle: { color: theme.colors.onSurface, fontSize: 22, fontWeight: "800", lineHeight: 26 },
  promoSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 4 },
  sectionHeader: {
    paddingHorizontal: theme.spacing.xl, marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md, flexDirection: "row",
    alignItems: "center", justifyContent: "space-between",
  },
  sectionTitle: { color: theme.colors.onSurface, fontSize: 18, fontWeight: "700" },
  sectionCount: { color: theme.colors.muted, fontSize: 13 },
  chipRow: { height: 56 },
  chipRowContent: { paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm, alignItems: "center" },
  filtersRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    marginTop: theme.spacing.md,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: theme.spacing.md, height: 36,
    borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1, borderColor: theme.colors.border, flexShrink: 0,
  },
  chipActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  chipText: { color: theme.colors.onSurface, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: theme.colors.onBrandPrimary },
  featuredCard: {
    width: 180, height: 220, borderRadius: theme.radius.lg,
    overflow: "hidden", backgroundColor: theme.colors.surfaceSecondary,
  },
  featuredImg: { width: "100%", height: "100%" },
  featuredScrim: { position: "absolute", bottom: 0, left: 0, right: 0, height: "70%" },
  featuredInfo: { position: "absolute", bottom: 0, left: 0, right: 0, padding: theme.spacing.md },
  ratingPill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(11,17,32,0.75)", paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: theme.radius.sm, alignSelf: "flex-start", marginBottom: 6,
  },
  ratingPillText: { color: theme.colors.brand, fontSize: 11, fontWeight: "700" },
  featuredName: { color: theme.colors.onSurface, fontSize: 15, fontWeight: "700" },
  featuredCat: { color: theme.colors.onSurfaceSecondary, fontSize: 12 },
  providerRow: {
    flexDirection: "row", alignItems: "center", gap: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border,
  },
  providerAvatar: { width: 56, height: 56, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceTertiary },
  providerName: { color: theme.colors.onSurface, fontSize: 15, fontWeight: "700" },
  providerCat: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  providerMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  providerRating: { color: theme.colors.brand, fontSize: 12, fontWeight: "700" },
  providerReviews: { color: theme.colors.muted, fontSize: 12 },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: theme.colors.muted, marginHorizontal: 4 },
  providerRate: { color: theme.colors.onSurfaceSecondary, fontSize: 12, fontWeight: "600" },
  providerDistance: { color: theme.colors.brand, fontSize: 12, fontWeight: "700" },
  locHint: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginHorizontal: theme.spacing.xl, marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,171,0,0.10)",
    borderWidth: 1, borderColor: "rgba(255,171,0,0.35)",
  },
  locHintText: { flex: 1, color: theme.colors.warning, fontSize: 12, fontWeight: "600" },
  empty: { alignItems: "center", gap: theme.spacing.sm, paddingVertical: theme.spacing.xxl },
  emptyText: { color: theme.colors.muted, fontSize: 14 },
});
