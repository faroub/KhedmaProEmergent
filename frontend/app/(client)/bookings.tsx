import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";
import { bookingsStore } from "@/src/db/localDb";
import { RevealPhoneButton } from "@/src/RevealPhoneButton";
import type { LocalBooking } from "@/src/db/schema";

const STATUS_COLOR: Record<string, string> = {
  pending: theme.colors.warning,
  confirmed: theme.colors.info,
  completed: theme.colors.success,
  cancelled: theme.colors.error,
};

export default function Bookings() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useT();
  const [bookings, setBookings] = useState<LocalBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"all" | "pending" | "confirmed" | "completed">("all");
  const [offline, setOffline] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [noteEditor, setNoteEditor] = useState<{ id: string; text: string } | null>(null);
  const [savingNote, setSavingNote] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    // 1) Instant offline-first read from SQLite
    try {
      const cached = await bookingsStore.list(user.id);
      if (cached.length) setBookings(cached);
      const sync = await bookingsStore.getLastSync(user.id);
      setLastSync(sync);
    } catch {}
    // 2) Refresh from server, upsert into local DB
    try {
      const data: any[] = await api.myBookings();
      // Preserve local_notes from cache when merging server data
      const cachedById = new Map((await bookingsStore.list(user.id)).map((b) => [b.id, b]));
      const merged: LocalBooking[] = data.map((d) => ({
        ...d,
        local_notes: cachedById.get(d.id)?.local_notes ?? null,
      }));
      await bookingsStore.upsertMany(user.id, merged);
      const fresh = await bookingsStore.list(user.id);
      setBookings(fresh);
      setOffline(false);
      const sync = await bookingsStore.getLastSync(user.id);
      setLastSync(sync);
    } catch {
      setOffline(true);
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = tab === "all" ? bookings : bookings.filter((b) => b.status === tab);
  const isProvider = user?.role === "service_provider";

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.updateBookingStatus(id, status);
      // When client confirms completion → prompt for review immediately.
      if (!isProvider && status === "completed") {
        router.push(`/review/${id}`);
      }
      load();
    } catch (e: any) {
      console.log(e);
    }
  };

  const openNote = (b: LocalBooking) => {
    setNoteEditor({ id: b.id, text: b.local_notes || "" });
  };

  const saveNote = async () => {
    if (!noteEditor || !user) return;
    setSavingNote(true);
    try {
      await bookingsStore.setLocalNotes(noteEditor.id, user.id, noteEditor.text);
      setBookings((prev) =>
        prev.map((b) => (b.id === noteEditor.id ? { ...b, local_notes: noteEditor.text } : b))
      );
    } finally {
      setSavingNote(false);
      setNoteEditor(null);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("bookings.title")}</Text>
        {offline && (
          <View style={styles.offlineBadge} testID="offline-badge">
            <Ionicons name="cloud-offline-outline" size={12} color={theme.colors.warning} />
            <Text style={styles.offlineText}>{t("bookings.offline")}</Text>
          </View>
        )}
      </View>

      {lastSync && (
        <Text style={styles.syncedAt} testID="last-sync">
          {t("bookings.lastSync")} · {new Date(lastSync).toLocaleTimeString()}
        </Text>
      )}

      <View style={styles.tabsContainer}>
        {(["all", "pending", "confirmed", "completed"] as const).map((tt) => (
          <Pressable
            key={tt}
            testID={`bookings-tab-${tt}`}
            onPress={() => setTab(tt)}
            style={[styles.tab, tab === tt && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === tt && styles.tabTextActive]}>
              {t(`bookings.${tt}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xl }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: theme.spacing.xl, paddingBottom: 100, gap: theme.spacing.md }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={theme.colors.brand}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={40} color={theme.colors.muted} />
              <Text style={styles.emptyText}>{t("bookings.empty")}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card} testID={`booking-${item.id}`}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {isProvider ? item.client_name : item.provider_name}
                  </Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {item.provider_category || ""} • {new Date(item.scheduled_date).toLocaleDateString()}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: `${STATUS_COLOR[item.status]}22`,
                      borderColor: STATUS_COLOR[item.status],
                    },
                  ]}
                >
                  <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] }]}>
                    {item.status}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardDesc} numberOfLines={2}>{item.task_description}</Text>
              <View style={styles.cardMeta}>
                <Ionicons name="location-outline" size={13} color={theme.colors.muted} />
                <Text style={styles.cardMetaText} numberOfLines={2}>{item.address}</Text>
              </View>
              {isProvider && item.client_phone && (
                <View style={styles.cardMeta}>
                  <Ionicons name="call-outline" size={13} color={theme.colors.muted} />
                  <Text style={styles.cardMetaText} numberOfLines={1}>{item.client_phone}</Text>
                </View>
              )}
              {/* Reveal counterpart phone: provider→guest bookings inline the phone
                  already (client_phone above). For every other booking, use the
                  gated reveal endpoint which only unlocks after confirmation. */}
              {(() => {
                const counterpartId = isProvider ? item.client_id : item.provider_id;
                const alreadyShown = isProvider && !!item.client_phone;
                if (!counterpartId || counterpartId.startsWith("guest:") || alreadyShown) return null;
                return (
                  <View style={styles.revealRow}>
                    <RevealPhoneButton
                      otherId={counterpartId}
                      bookingStatus={item.status}
                      testID={`reveal-${item.id}`}
                    />
                  </View>
                );
              })()}
              {item.estimated_total ? (
                <Text style={styles.cardTotal}>≈ {item.estimated_total} DZD</Text>
              ) : null}

              {/* Provider-only offline note */}
              {isProvider && (
                <Pressable
                  testID={`note-${item.id}`}
                  onPress={() => openNote(item)}
                  style={styles.noteBox}
                >
                  <Ionicons
                    name={item.local_notes ? "document-text" : "create-outline"}
                    size={14}
                    color={item.local_notes ? theme.colors.brand : theme.colors.muted}
                  />
                  <Text
                    style={[
                      styles.noteText,
                      { color: item.local_notes ? theme.colors.onSurfaceSecondary : theme.colors.muted },
                    ]}
                    numberOfLines={2}
                  >
                    {item.local_notes || t("bookings.addNote")}
                  </Text>
                </Pressable>
              )}

              <View style={styles.actions}>
                {isProvider && item.status === "pending" && (
                  <>
                    <Pressable
                      testID={`accept-${item.id}`}
                      style={[styles.actionBtn, styles.actionPrimary]}
                      onPress={() => updateStatus(item.id, "confirmed")}
                    >
                      <Text style={styles.actionPrimaryText}>{t("bookings.accept")}</Text>
                    </Pressable>
                    <Pressable
                      testID={`decline-${item.id}`}
                      style={[styles.actionBtn, styles.actionOutline]}
                      onPress={() => updateStatus(item.id, "cancelled")}
                    >
                      <Text style={styles.actionOutlineText}>{t("bookings.decline")}</Text>
                    </Pressable>
                  </>
                )}
                {isProvider && item.status === "confirmed" && (
                  <Pressable
                    testID={`complete-${item.id}`}
                    style={[styles.actionBtn, styles.actionPrimary]}
                    onPress={() => updateStatus(item.id, "completed")}
                  >
                    <Text style={styles.actionPrimaryText}>{t("bookings.markWorkDone")}</Text>
                  </Pressable>
                )}
                {isProvider && item.status === "awaiting_confirmation" && (
                  <View style={[styles.actionBtn, styles.actionOutline]}>
                    <Text style={styles.actionOutlineText}>{t("bookings.awaitingClient")}</Text>
                  </View>
                )}
                {!isProvider && item.status === "awaiting_confirmation" && (
                  <Pressable
                    testID={`confirm-done-${item.id}`}
                    style={[styles.actionBtn, styles.actionPrimary]}
                    onPress={() => updateStatus(item.id, "completed")}
                  >
                    <Ionicons name="checkmark-done" size={14} color={theme.colors.onBrandPrimary} />
                    <Text style={styles.actionPrimaryText}>{t("bookings.confirmDone")}</Text>
                  </Pressable>
                )}
                {!isProvider && (item.status === "pending" || item.status === "confirmed") && (
                  <Pressable
                    testID={`cancel-${item.id}`}
                    style={[styles.actionBtn, styles.actionOutline]}
                    onPress={() => updateStatus(item.id, "cancelled")}
                  >
                    <Text style={styles.actionOutlineText}>{t("bookings.cancel")}</Text>
                  </Pressable>
                )}
                {!isProvider && item.status === "completed" && !item.reviewed && (
                  <Pressable
                    testID={`review-${item.id}`}
                    style={[styles.actionBtn, styles.actionPrimary]}
                    onPress={() => router.push(`/review/${item.id}`)}
                  >
                    <Ionicons name="star" size={14} color={theme.colors.onBrandPrimary} />
                    <Text style={styles.actionPrimaryText}>{t("bookings.leaveReview")}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        />
      )}

      {/* Note editor */}
      <Modal
        visible={noteEditor !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setNoteEditor(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setNoteEditor(null)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t("bookings.noteTitle")}</Text>
            <Text style={styles.modalSub}>{t("bookings.noteSub")}</Text>
            <TextInput
              testID="note-input"
              value={noteEditor?.text}
              onChangeText={(v) => setNoteEditor((n) => (n ? { ...n, text: v } : null))}
              placeholder={t("bookings.notePh")}
              placeholderTextColor={theme.colors.muted}
              multiline
              style={styles.noteInput}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable
                testID="note-cancel"
                onPress={() => setNoteEditor(null)}
                style={[styles.modalBtn, styles.modalCancel]}
              >
                <Text style={styles.modalCancelText}>{t("account.cancel")}</Text>
              </Pressable>
              <Pressable
                testID="note-save"
                onPress={saveNote}
                disabled={savingNote}
                style={[styles.modalBtn, styles.modalConfirm]}
              >
                {savingNote ? (
                  <ActivityIndicator color={theme.colors.onBrandPrimary} />
                ) : (
                  <Text style={styles.modalConfirmText}>{t("bookings.saveNote")}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xs },
  title: { color: theme.colors.onSurface, fontSize: 24, fontWeight: "800" },
  syncedAt: { color: theme.colors.muted, fontSize: 11, paddingHorizontal: theme.spacing.xl, marginTop: 2 },
  offlineBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceSecondary, borderWidth: 1, borderColor: theme.colors.warning },
  offlineText: { color: theme.colors.warning, fontSize: 11, fontWeight: "700" },
  tabsContainer: { flexDirection: "row", paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm, height: 56, alignItems: "center" },
  tab: {
    paddingHorizontal: theme.spacing.md, height: 36, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSecondary, borderWidth: 1, borderColor: theme.colors.border,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  tabActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  tabText: { color: theme.colors.onSurface, fontWeight: "600", fontSize: 13 },
  tabTextActive: { color: theme.colors.onBrandPrimary },
  card: {
    padding: theme.spacing.lg, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1, borderColor: theme.colors.border, gap: theme.spacing.sm,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.sm },
  cardTitle: { color: theme.colors.onSurface, fontSize: 16, fontWeight: "700" },
  cardSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  cardDesc: { color: theme.colors.onSurfaceTertiary, fontSize: 13, lineHeight: 18 },
  cardMeta: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  cardMetaText: { color: theme.colors.muted, fontSize: 12, flex: 1 },
  cardTotal: { color: theme.colors.brand, fontSize: 14, fontWeight: "700" },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.pill, borderWidth: 1 },
  statusText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  actions: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.xs, flexWrap: "wrap" },
  actionBtn: {
    flex: 1, minWidth: 100, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center",
    height: 40, borderRadius: theme.radius.pill, paddingHorizontal: 10,
  },
  actionPrimary: { backgroundColor: theme.colors.brand },
  actionPrimaryText: { color: theme.colors.onBrandPrimary, fontWeight: "700", fontSize: 13 },
  actionOutline: { borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: "transparent" },
  actionOutlineText: { color: theme.colors.onSurface, fontWeight: "600", fontSize: 13 },
  empty: { alignItems: "center", gap: theme.spacing.sm, paddingVertical: theme.spacing.xxxl },
  emptyText: { color: theme.colors.muted, fontSize: 14 },

  // note box
  noteBox: {
    flexDirection: "row", gap: theme.spacing.sm, alignItems: "flex-start",
    padding: theme.spacing.sm, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17 },
  revealRow: { marginTop: 2 },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.xl, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md,
  },
  modalHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.borderStrong, marginBottom: theme.spacing.sm },
  modalTitle: { color: theme.colors.onSurface, fontWeight: "800", fontSize: 18 },
  modalSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: -theme.spacing.sm },
  noteInput: {
    minHeight: 120, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, padding: theme.spacing.md,
    color: theme.colors.onSurface, fontSize: 14, backgroundColor: theme.colors.surface,
    textAlignVertical: "top",
  },
  modalActions: { flexDirection: "row", gap: theme.spacing.md },
  modalBtn: {
    flex: 1, height: 46, borderRadius: theme.radius.pill,
    alignItems: "center", justifyContent: "center",
  },
  modalCancel: { borderWidth: 1, borderColor: theme.colors.border },
  modalCancelText: { color: theme.colors.onSurface, fontWeight: "700" },
  modalConfirm: { backgroundColor: theme.colors.brand },
  modalConfirmText: { color: theme.colors.onBrandPrimary, fontWeight: "800" },
});
