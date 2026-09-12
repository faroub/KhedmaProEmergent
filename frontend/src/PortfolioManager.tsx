import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  FlatList,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { api, type PortfolioItem } from "./api";
import { useAuth } from "./auth";
import { theme } from "./theme";
import { useT } from "./language";
import { compressImage } from "./utils/imageCompress";

type Props = { onChange?: (imgs: PortfolioItem[]) => void };

const MAX_IMAGES = 20;
const SCREEN = Dimensions.get("window");

/** Common category tags a provider might tag a photo with. Localized in UI. */
const TAG_SUGGESTIONS = [
  "before",
  "after",
  "residential",
  "commercial",
  "interior",
  "exterior",
  "detail",
  "custom",
];

function normalize(list: any[]): PortfolioItem[] {
  return (list || []).map((p) =>
    typeof p === "string"
      ? { url: p, caption: null, tags: [], is_cover: false }
      : {
          url: p.url,
          caption: p.caption ?? null,
          tags: p.tags ?? [],
          is_cover: !!p.is_cover,
        },
  );
}

export function PortfolioManager({ onChange }: Props) {
  const { user, refresh } = useAuth();
  const { t } = useT();

  const [items, setItems] = useState<PortfolioItem[]>(normalize(user?.portfolio_images || []));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const [editorIdx, setEditorIdx] = useState<number | null>(null);
  const [editorDraft, setEditorDraft] = useState<PortfolioItem | null>(null);

  const [viewerIdx, setViewerIdx] = useState<number | null>(null);

  useEffect(() => {
    setItems(normalize(user?.portfolio_images || []));
  }, [user?.portfolio_images]);

  const persist = async (list: PortfolioItem[]) => {
    setItems(list);
    onChange?.(list);
    try {
      await api.updatePortfolio(list);
      await refresh();
    } catch {}
  };

  const pick = async () => {
    if (busy || items.length >= MAX_IMAGES) return;
    setBusy(true);
    setProgress(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") return;
      const slotsLeft = MAX_IMAGES - items.length;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsMultipleSelection: true,
        selectionLimit: slotsLeft,
      });
      if (result.canceled || !result.assets?.length) return;
      // Cap once more in case the picker returned more than we asked for.
      const picked = result.assets.slice(0, slotsLeft);
      const additions: PortfolioItem[] = [];
      for (let i = 0; i < picked.length; i++) {
        const asset = picked[i];
        setProgress(
          t("portfolio.uploadingProgress", { i: i + 1, n: picked.length }),
        );
        try {
          const c = await compressImage(asset.uri, {
            targetBytes: 220 * 1024,
            initialWidth: 1440,
            minWidth: 720,
            initialQuality: 0.6,
          });
          additions.push({
            url: c.dataUri,
            // First-ever image becomes the cover.
            is_cover: items.length === 0 && additions.length === 0,
            caption: null,
            tags: [],
          });
        } catch (err) {
          console.warn("portfolio.compress failed", err);
        }
      }
      if (additions.length > 0) {
        setProgress(t("portfolio.savingBatch", { n: additions.length }));
        await persist([...items, ...additions]);
      }
    } catch (err) {
      console.warn("portfolio.pick failed", err);
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(null), 3000);
    }
  };

  const remove = async (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    // Ensure at least one cover remains
    if (next.length && !next.some((n) => n.is_cover)) {
      next[0] = { ...next[0], is_cover: true };
    }
    await persist(next);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const move = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    await persist(next);
  };

  /** Renderer for a single draggable thumbnail. Used inside `DraggableFlatList`. */
  const renderThumb = ({ item: it, drag, isActive, getIndex }: RenderItemParams<PortfolioItem>) => {
    const idx = getIndex() ?? 0;
    return (
      <ScaleDecorator>
        <Pressable
          style={[
            styles.thumbWrap,
            isActive && styles.thumbWrapActive,
            { marginRight: 8 },
          ]}
          onPress={() => setViewerIdx(idx)}
          onLongPress={drag}
          delayLongPress={180}
          disabled={busy}
        >
          <Image
            source={{ uri: it.url }}
            style={styles.thumb}
            contentFit="cover"
            testID={`portfolio-thumb-${idx}`}
          />
          {it.is_cover && (
            <View style={styles.thumbCoverBadge}>
              <Ionicons name="star" size={10} color="#fff" />
            </View>
          )}
          <View style={styles.dragHandleBadge} pointerEvents="none">
            <Ionicons name="reorder-two" size={14} color="#fff" />
          </View>
          {(it.caption || (it.tags && it.tags.length)) && (
            <View style={styles.thumbCaptionRow}>
              <Text style={styles.thumbCaption} numberOfLines={1}>
                {it.caption || it.tags?.[0]}
              </Text>
            </View>
          )}
          <Pressable
            testID={`portfolio-remove-${idx}`}
            hitSlop={8}
            style={styles.removeBtn}
            onPress={() => remove(idx)}
          >
            <Ionicons name="close" size={14} color="#fff" />
          </Pressable>
          <Pressable
            testID={`portfolio-edit-${idx}`}
            hitSlop={8}
            style={styles.editBtn}
            onPress={() => openEditor(idx)}
          >
            <Ionicons name="pencil" size={12} color="#fff" />
          </Pressable>
        </Pressable>
      </ScaleDecorator>
    );
  };

  // Kept for future double-tap-to-set-cover gesture; the editor also toggles the cover flag.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setCover = async (idx: number) => {
    const next = items.map((it, i) => ({ ...it, is_cover: i === idx }));
    await persist(next);
  };

  const openEditor = (idx: number) => {
    setEditorIdx(idx);
    setEditorDraft({ ...items[idx] });
  };

  const saveEditor = async () => {
    if (editorIdx == null || !editorDraft) return;
    const next = items.map((it, i) => (i === editorIdx ? { ...editorDraft } : it));
    // If user set is_cover, ensure single cover
    if (editorDraft.is_cover) {
      for (let i = 0; i < next.length; i++) if (i !== editorIdx) next[i].is_cover = false;
    }
    setEditorIdx(null);
    setEditorDraft(null);
    await persist(next);
  };

  const cover = useMemo(() => items.find((i) => i.is_cover) || items[0], [items]);

  return (
    <View style={styles.wrap} testID="portfolio-manager">
      <View style={styles.header}>
        <Text style={styles.title}>{t("portfolio.title")}</Text>
        <Text style={styles.limit}>
          {items.length}/{MAX_IMAGES} · {t("portfolio.limit")}
        </Text>
      </View>
      {items.length > 1 && (
        <Text style={styles.reorderHint} testID="portfolio-reorder-hint">
          {t("portfolio.reorderHint")}
        </Text>
      )}

      {/* Cover preview */}
      {cover && (
        <Pressable
          testID="portfolio-cover"
          onPress={() => setViewerIdx(items.indexOf(cover))}
          style={styles.coverWrap}
        >
          <Image source={{ uri: cover.url }} style={styles.coverImg} contentFit="cover" />
          <View style={styles.coverBadge}>
            <Ionicons name="star" size={11} color="#fff" />
            <Text style={styles.coverBadgeText}>{t("portfolio.cover")}</Text>
          </View>
        </Pressable>
      )}

      <View style={styles.dragArea}>
        <DraggableFlatList<PortfolioItem>
          data={items}
          horizontal
          keyExtractor={(it, i) => `${i}-${(it.url || "").slice(-8)}`}
          onDragEnd={({ data }) => {
            void persist(data);
          }}
          renderItem={renderThumb}
          contentContainerStyle={{ paddingRight: 8 }}
          showsHorizontalScrollIndicator={false}
          activationDistance={6}
          ListFooterComponent={
            items.length < MAX_IMAGES ? (
              <Pressable testID="portfolio-add-btn" style={styles.addBtn} onPress={pick} disabled={busy}>
                {busy ? (
                  <ActivityIndicator color={theme.colors.brand} />
                ) : (
                  <>
                    <Ionicons name="add" size={28} color={theme.colors.brand} />
                    <Text style={styles.addText}>{t("portfolio.add")}</Text>
                  </>
                )}
              </Pressable>
            ) : null
          }
        />
      </View>

      {progress && <Text style={styles.progress}>{progress}</Text>}
      {items.length === 0 && !busy && <Text style={styles.emptyHint}>{t("portfolio.empty")}</Text>}

      {/* Editor modal */}
      <Modal
        transparent
        visible={editorIdx !== null}
        animationType="slide"
        onRequestClose={() => setEditorIdx(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditorIdx(null)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{t("portfolio.editorTitle")}</Text>
            {editorDraft && (
              <Image
                source={{ uri: editorDraft.url }}
                style={styles.editorPreview}
                contentFit="cover"
              />
            )}
            <Text style={styles.fieldLabel}>{t("portfolio.caption")}</Text>
            <TextInput
              testID="portfolio-caption-input"
              value={editorDraft?.caption || ""}
              onChangeText={(v) =>
                setEditorDraft((d) => (d ? { ...d, caption: v.slice(0, 140) } : d))
              }
              placeholder={t("portfolio.captionPh")}
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
              maxLength={140}
            />
            <Text style={styles.fieldLabel}>{t("portfolio.tags")}</Text>
            <View style={styles.tagsRow}>
              {TAG_SUGGESTIONS.map((tg) => {
                const active = editorDraft?.tags?.includes(tg);
                return (
                  <Pressable
                    key={tg}
                    testID={`portfolio-tag-${tg}`}
                    onPress={() =>
                      setEditorDraft((d) => {
                        if (!d) return d;
                        const cur = d.tags ?? [];
                        return {
                          ...d,
                          tags: cur.includes(tg)
                            ? cur.filter((x) => x !== tg)
                            : cur.length >= 6
                            ? cur
                            : [...cur, tg],
                        };
                      })
                    }
                    style={[styles.tag, active && styles.tagActive]}
                  >
                    <Text style={[styles.tagText, active && styles.tagTextActive]}>
                      {t(`portfolio.tag_${tg}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              testID="portfolio-cover-toggle"
              onPress={() =>
                setEditorDraft((d) => (d ? { ...d, is_cover: !d.is_cover } : d))
              }
              style={styles.coverToggle}
            >
              <Ionicons
                name={editorDraft?.is_cover ? "star" : "star-outline"}
                size={18}
                color={editorDraft?.is_cover ? theme.colors.brand : theme.colors.onSurfaceSecondary}
              />
              <Text style={styles.coverToggleText}>
                {editorDraft?.is_cover ? t("portfolio.isCover") : t("portfolio.setCover")}
              </Text>
            </Pressable>
            <View style={styles.sheetActions}>
              <Pressable
                onPress={() => setEditorIdx(null)}
                style={[styles.btn, styles.btnGhost]}
              >
                <Text style={styles.btnGhostText}>{t("account.cancel")}</Text>
              </Pressable>
              <Pressable
                testID="portfolio-editor-save"
                onPress={saveEditor}
                style={[styles.btn, styles.btnPrimary]}
              >
                <Text style={styles.btnPrimaryText}>{t("portfolio.save")}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Full-screen viewer */}
      <Modal
        visible={viewerIdx !== null}
        animationType="fade"
        onRequestClose={() => setViewerIdx(null)}
        transparent={false}
        statusBarTranslucent
      >
        <View style={styles.viewerRoot}>
          <FlatList
            data={items}
            horizontal
            pagingEnabled
            initialScrollIndex={viewerIdx || 0}
            getItemLayout={(_, i) => ({ length: SCREEN.width, offset: SCREEN.width * i, index: i })}
            keyExtractor={(it, i) => `${i}-${(it.url || "").slice(-6)}`}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={{ width: SCREEN.width, height: SCREEN.height, justifyContent: "center", backgroundColor: "#000" }}>
                <Image source={{ uri: item.url }} style={styles.viewerImg} contentFit="contain" />
                {(item.caption || (item.tags && item.tags.length > 0)) && (
                  <View style={styles.viewerMeta}>
                    {item.caption ? <Text style={styles.viewerCaption}>{item.caption}</Text> : null}
                    {item.tags && item.tags.length > 0 ? (
                      <View style={styles.viewerTags}>
                        {item.tags.map((tg) => (
                          <View key={tg} style={styles.viewerTag}>
                            <Text style={styles.viewerTagText}>{t(`portfolio.tag_${tg}`)}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
            )}
          />
          <Pressable
            testID="portfolio-viewer-close"
            onPress={() => setViewerIdx(null)}
            style={styles.viewerClose}
            hitSlop={12}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.sm, marginTop: theme.spacing.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 15 },
  limit: { color: theme.colors.muted, fontSize: 11 },
  reorderHint: { color: theme.colors.muted, fontSize: 10, fontStyle: "italic", marginTop: -2 },

  coverWrap: {
    width: "100%",
    height: 160,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceSecondary,
    marginBottom: theme.spacing.xs,
  },
  coverImg: { width: "100%", height: "100%" },
  coverBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  coverBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },

  thumbWrap: {
    width: 110,
    height: 110,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    position: "relative",
  },
  thumbWrapActive: {
    // Slightly bright border + shadow while dragging.
    borderWidth: 2,
    borderColor: theme.colors.brand,
  },
  dragArea: { minHeight: 118 },
  dragHandleBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: { width: "100%", height: "100%", backgroundColor: theme.colors.surfaceSecondary },
  thumbCoverBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbCaptionRow: {
    position: "absolute",
    left: 32,
    right: 32,
    bottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  thumbCaption: { color: "#fff", fontSize: 10, fontWeight: "600" },

  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  editBtn: {
    position: "absolute",
    top: 30,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  reorderBtn: {
    position: "absolute",
    bottom: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    display: "none", // legacy — kept for backward compat; drag-to-reorder is the primary UX now
  },
  reorderBtnLeft: { left: 4 },
  reorderBtnRight: { right: 4 },

  addBtn: {
    width: 110,
    height: 110,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.brand,
    borderStyle: "dashed",
    backgroundColor: theme.colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  addText: { color: theme.colors.brand, fontSize: 12, fontWeight: "600" },

  emptyHint: {
    color: theme.colors.muted,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: theme.spacing.sm,
  },
  progress: {
    color: theme.colors.brand,
    fontSize: 11,
    textAlign: "center",
    paddingVertical: 2,
  },

  // Modal sheet
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
    marginBottom: theme.spacing.sm,
  },
  sheetTitle: { color: theme.colors.onSurface, fontWeight: "800", fontSize: 17 },
  editorPreview: { width: "100%", height: 160, borderRadius: theme.radius.md },
  fieldLabel: { color: theme.colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700", marginTop: theme.spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    color: theme.colors.onSurface,
    fontSize: 14,
    backgroundColor: theme.colors.surface,
  },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tagActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  tagText: { color: theme.colors.onSurfaceSecondary, fontSize: 12, fontWeight: "600" },
  tagTextActive: { color: theme.colors.onBrandPrimary },
  coverToggle: {
    marginTop: theme.spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  coverToggleText: { color: theme.colors.onSurface, fontSize: 13, fontWeight: "600" },
  sheetActions: { flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.sm },
  btn: { flex: 1, height: 46, borderRadius: theme.radius.pill, alignItems: "center", justifyContent: "center" },
  btnGhost: { borderWidth: 1, borderColor: theme.colors.border },
  btnGhostText: { color: theme.colors.onSurface, fontWeight: "700" },
  btnPrimary: { backgroundColor: theme.colors.brand },
  btnPrimaryText: { color: theme.colors.onBrandPrimary, fontWeight: "800" },

  // Viewer
  viewerRoot: { flex: 1, backgroundColor: "#000" },
  viewerImg: { width: SCREEN.width, height: SCREEN.height },
  viewerClose: {
    position: "absolute",
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerMeta: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 60,
    paddingHorizontal: 24,
    gap: 8,
  },
  viewerCaption: { color: "#fff", fontSize: 15, fontWeight: "600" },
  viewerTags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  viewerTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: theme.radius.pill,
  },
  viewerTagText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});
