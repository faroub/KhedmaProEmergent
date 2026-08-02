import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Modal,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api } from "./api";
import { theme } from "./theme";
import { useT } from "./language";
import { compressImage, formatBytes } from "./utils/imageCompress";

const DOC_TYPES: { key: DocType; tKey: string; required: boolean }[] = [
  { key: "id_recto", tKey: "verify.idRecto", required: true },
  { key: "id_verso", tKey: "verify.idVerso", required: true },
  { key: "certification", tKey: "verify.certification", required: false },
  { key: "background_check", tKey: "verify.background", required: false },
];

type DocType = "id_recto" | "id_verso" | "certification" | "background_check";

type DraftDoc = {
  type: DocType;
  url: string;
  note?: string | null;
  bytes?: number;
};

type ServerDoc = {
  id: string;
  type: string;
  url: string;
  note?: string | null;
  uploaded_at?: string;
};

const STATUS_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  unverified: "shield-outline",
  pending: "hourglass-outline",
  verified: "shield-checkmark",
  rejected: "close-circle-outline",
};

export function VerificationCard() {
  const { t } = useT();
  const [status, setStatus] = useState<string>("unverified");
  const [documents, setDocuments] = useState<ServerDoc[]>([]);
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [draft, setDraft] = useState<Record<DocType, DraftDoc | null>>({
    id_recto: null,
    id_verso: null,
    certification: null,
    background_check: null,
  });
  const [uploadingType, setUploadingType] = useState<DocType | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s: any = await api.verificationStatus();
      setStatus(s.status || "unverified");
      setDocuments(s.documents || []);
      setRejectReason(s.reject_reason || null);
    } catch {
      // silently ignore — provider may not be a service_provider yet
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openUploader = () => {
    // Prefill draft with any existing docs (rejected or pending)
    const next: Record<DocType, DraftDoc | null> = {
      id_recto: null,
      id_verso: null,
      certification: null,
      background_check: null,
    };
    documents.forEach((d) => {
      if ((["id_recto", "id_verso", "certification", "background_check"] as DocType[]).includes(d.type as DocType)) {
        next[d.type as DocType] = { type: d.type as DocType, url: d.url, note: d.note ?? null };
      }
    });
    setDraft(next);
    setUploaderOpen(true);
  };

  const pickForType = async (type: DocType) => {
    if (busy) return;
    setBusy(true);
    setUploadingType(type);
    setProgress(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setProgress(t("verify.compressing"));
      const c = await compressImage(asset.uri, {
        targetBytes: 260 * 1024,
        initialWidth: 1440,
        minWidth: 800,
        initialQuality: 0.6,
      });
      setDraft((d) => ({ ...d, [type]: { type, url: c.dataUri, bytes: c.bytes } }));
      setProgress(
        t("portfolio.compressedInfo", {
          before: formatBytes(c.originalBytes),
          after: formatBytes(c.bytes),
          passes: c.passes,
        }),
      );
    } catch {
      // no-op
    } finally {
      setUploadingType(null);
      setBusy(false);
      setTimeout(() => setProgress(null), 2500);
    }
  };

  const canSubmit =
    !!draft.id_recto?.url && !!draft.id_verso?.url && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const docs = (Object.values(draft) as (DraftDoc | null)[])
        .filter((d): d is DraftDoc => !!d && !!d.url)
        .map((d) => ({ type: d.type, url: d.url, note: d.note ?? null }));
      await api.submitVerification(docs);
      setUploaderOpen(false);
      await load();
    } catch {
      // surface via alert? For now noop
    } finally {
      setSubmitting(false);
    }
  };

  const chipStyle = statusChip(status);
  const canEdit = status === "unverified" || status === "rejected";

  return (
    <View style={styles.card} testID="verification-card">
      <View style={styles.headerRow}>
        <View style={[styles.chip, { backgroundColor: chipStyle.bg }]}>
          <Ionicons name={STATUS_ICON[status]} size={14} color={chipStyle.fg} />
          <Text style={[styles.chipText, { color: chipStyle.fg }]}>
            {t(`verify.status.${status}`)}
          </Text>
        </View>
      </View>
      <Text style={styles.title}>{t("verify.title")}</Text>
      <Text style={styles.desc}>{t(`verify.desc.${status}`)}</Text>

      {status === "rejected" && rejectReason && (
        <View style={styles.rejectBox}>
          <Ionicons name="alert-circle" size={16} color={theme.colors.error} />
          <Text style={styles.rejectText}>{rejectReason}</Text>
        </View>
      )}

      {status === "pending" && documents.length > 0 && (
        <View style={styles.pendingBox}>
          <Text style={styles.pendingLabel}>{t("verify.submitted", { n: documents.length })}</Text>
        </View>
      )}

      {canEdit && (
        <Pressable
          testID="verify-open-uploader"
          onPress={openUploader}
          style={styles.primaryBtn}
        >
          <Ionicons name="cloud-upload-outline" size={16} color={theme.colors.onBrandPrimary} />
          <Text style={styles.primaryBtnText}>
            {status === "rejected" ? t("verify.resubmit") : t("verify.startCta")}
          </Text>
        </Pressable>
      )}

      {/* Uploader modal */}
      <Modal
        transparent
        visible={uploaderOpen}
        animationType="slide"
        onRequestClose={() => setUploaderOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setUploaderOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{t("verify.title")}</Text>
            <Text style={styles.sheetSub}>{t("verify.uploaderSub")}</Text>
            <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: theme.spacing.md }}>
              {DOC_TYPES.map((dt) => {
                const d = draft[dt.key];
                return (
                  <View key={dt.key} style={styles.docRow} testID={`verify-doc-${dt.key}`}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={styles.docLabel}>{t(dt.tKey)}</Text>
                        {dt.required && (
                          <Text style={styles.docRequired}>{t("verify.required")}</Text>
                        )}
                      </View>
                      <Text style={styles.docHint}>{t(`${dt.tKey}Hint`)}</Text>
                    </View>
                    {d?.url ? (
                      <View style={styles.thumbRow}>
                        <Image source={{ uri: d.url }} style={styles.docThumb} contentFit="cover" />
                        <Pressable
                          testID={`verify-doc-${dt.key}-replace`}
                          style={styles.replaceBtn}
                          onPress={() => pickForType(dt.key)}
                          disabled={busy}
                        >
                          {uploadingType === dt.key ? (
                            <ActivityIndicator color={theme.colors.brand} />
                          ) : (
                            <Ionicons name="refresh" size={14} color={theme.colors.brand} />
                          )}
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        testID={`verify-doc-${dt.key}-upload`}
                        style={styles.uploadBtn}
                        onPress={() => pickForType(dt.key)}
                        disabled={busy}
                      >
                        {uploadingType === dt.key ? (
                          <ActivityIndicator color={theme.colors.brand} />
                        ) : (
                          <>
                            <Ionicons name="add" size={16} color={theme.colors.brand} />
                            <Text style={styles.uploadBtnText}>{t("verify.upload")}</Text>
                          </>
                        )}
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>
            {progress && <Text style={styles.progress}>{progress}</Text>}
            <View style={styles.sheetActions}>
              <Pressable
                onPress={() => setUploaderOpen(false)}
                style={[styles.btn, styles.btnGhost]}
                disabled={submitting}
              >
                <Text style={styles.btnGhostText}>{t("account.cancel")}</Text>
              </Pressable>
              <Pressable
                testID="verify-submit"
                onPress={submit}
                style={[styles.btn, styles.btnPrimary, !canSubmit && { opacity: 0.5 }]}
                disabled={!canSubmit}
              >
                {submitting ? (
                  <ActivityIndicator color={theme.colors.onBrandPrimary} />
                ) : (
                  <Text style={styles.btnPrimaryText}>{t("verify.submitCta")}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function statusChip(s: string) {
  switch (s) {
    case "verified":
      return { bg: "rgba(45,180,120,0.15)", fg: theme.colors.success };
    case "pending":
      return { bg: "rgba(255,171,0,0.15)", fg: theme.colors.warning };
    case "rejected":
      return { bg: "rgba(220,53,69,0.12)", fg: theme.colors.error };
    default:
      return { bg: theme.colors.surface, fg: theme.colors.onSurfaceSecondary };
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  headerRow: { flexDirection: "row" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
  },
  chipText: { fontSize: 12, fontWeight: "700" },
  title: { color: theme.colors.onSurface, fontSize: 16, fontWeight: "800" },
  desc: { color: theme.colors.onSurfaceSecondary, fontSize: 13, lineHeight: 20 },
  rejectBox: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    padding: theme.spacing.sm,
    backgroundColor: "rgba(220,53,69,0.08)",
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: "rgba(220,53,69,0.35)",
  },
  rejectText: { flex: 1, color: theme.colors.error, fontSize: 12, lineHeight: 17 },
  pendingBox: {
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,171,0,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,171,0,0.3)",
  },
  pendingLabel: { color: theme.colors.warning, fontSize: 12, fontWeight: "700" },
  primaryBtn: {
    marginTop: theme.spacing.xs,
    flexDirection: "row",
    gap: 8,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand,
  },
  primaryBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "800", fontSize: 14 },

  // Sheet
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
    marginBottom: theme.spacing.sm,
  },
  sheetTitle: { color: theme.colors.onSurface, fontWeight: "800", fontSize: 18 },
  sheetSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12, lineHeight: 18 },

  docRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    alignItems: "center",
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  docLabel: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 14 },
  docRequired: {
    color: theme.colors.error,
    fontSize: 10,
    fontWeight: "800",
    borderColor: theme.colors.error,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  docHint: { color: theme.colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  docThumb: { width: 56, height: 56, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceSecondary },
  thumbRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  replaceBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.brand,
  },
  uploadBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.brand,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: theme.radius.pill,
  },
  uploadBtnText: { color: theme.colors.brand, fontWeight: "700", fontSize: 12 },
  progress: { color: theme.colors.brand, fontSize: 11, textAlign: "center" },

  sheetActions: { flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.sm },
  btn: { flex: 1, height: 46, borderRadius: theme.radius.pill, alignItems: "center", justifyContent: "center" },
  btnGhost: { borderWidth: 1, borderColor: theme.colors.border },
  btnGhostText: { color: theme.colors.onSurface, fontWeight: "700" },
  btnPrimary: { backgroundColor: theme.colors.brand },
  btnPrimaryText: { color: theme.colors.onBrandPrimary, fontWeight: "800" },
});
