import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Switch,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";

type SmsSection = {
  provider: "mock" | "twilio" | "http";
  healthy: boolean;
  detail: string;
  message_template: string;
  twilio_from: string;
  twilio_account_sid_masked: string;
  http_url: string;
  http_method: "GET" | "POST" | "PUT";
  http_body_template: string;
  http_content_type: string;
  http_header_keys: string[];
};

type Settings = {
  subscription_price_dzd: number;
  trial_days: number;
  payments_enabled: boolean;
  chargily_mode: "test" | "live";
  chargily_base_url: string;
  chargily_secret_key_source: "env" | "db" | "none";
  chargily_webhook_secret_source: "env" | "db" | "none";
  chargily_secret_key_masked: string;
  sms?: SmsSection;
};

type Health = Settings & { healthy: boolean; detail: string; http_status?: number };

export default function AdminSettings() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { isRTL, t } = useT();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [health_busy, setHealthBusy] = useState(false);

  // Editable local state
  const [price, setPrice] = useState("1000");
  const [trial, setTrial] = useState("90");
  const [mode, setMode] = useState<"test" | "live">("test");
  const [payEnabled, setPayEnabled] = useState(true);
  const [secretOverride, setSecretOverride] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  // SMS local state
  const [smsProvider, setSmsProvider] = useState<"mock" | "twilio" | "http">("mock");
  const [twilioSid, setTwilioSid] = useState("");
  const [twilioToken, setTwilioToken] = useState("");
  const [twilioFrom, setTwilioFrom] = useState("");
  const [showTwilioToken, setShowTwilioToken] = useState(false);
  const [httpUrl, setHttpUrl] = useState("");
  const [httpMethod, setHttpMethod] = useState<"GET" | "POST" | "PUT">("POST");
  const [httpContentType, setHttpContentType] = useState("application/json");
  const [httpBodyTpl, setHttpBodyTpl] = useState("");
  const [httpHeadersRaw, setHttpHeadersRaw] = useState("");
  const [msgTemplate, setMsgTemplate] = useState("");
  const [smsTestPhone, setSmsTestPhone] = useState("");
  const [smsTestBusy, setSmsTestBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.is_admin) return;
    setLoading(true);
    try {
      const s: any = await api.adminGetSettings();
      setSettings(s);
      setPrice(String(s.subscription_price_dzd || 1000));
      setTrial(String(s.trial_days || 90));
      setMode(s.chargily_mode || "test");
      setPayEnabled(!!s.payments_enabled);
      if (s.sms) {
        setSmsProvider(s.sms.provider || "mock");
        setTwilioFrom(s.sms.twilio_from || "");
        setTwilioSid(""); // never returned by backend — user must re-enter to change
        setTwilioToken("");
        setHttpUrl(s.sms.http_url || "");
        setHttpMethod((s.sms.http_method as any) || "POST");
        setHttpContentType(s.sms.http_content_type || "application/json");
        setHttpBodyTpl(s.sms.http_body_template || "");
        setMsgTemplate(s.sms.message_template || "");
      }
    } catch {
      setSettings(null);
    }
    setLoading(false);
  }, [user?.is_admin]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!authLoading && !user?.is_admin) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={40} color={theme.colors.muted} />
          <Text style={styles.emptyText}>{t("admin.forbidden")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      const patch: any = {
        subscription_price_dzd: Number(price) || 1000,
        trial_days: Number(trial) || 90,
        chargily_mode: mode,
        payments_enabled: payEnabled,
      };
      // Only send secret override if the field is not empty and not the placeholder mask.
      if (secretOverride.trim().length > 0) {
        patch.chargily_secret_key_override = secretOverride.trim();
      }
      // SMS block. Empty strings clear a stored value on the server; unchanged
      // secret fields (Twilio SID / token) are only sent when the admin actually
      // typed something so we don't accidentally overwrite existing keys with blanks.
      const smsPatch: any = { provider: smsProvider, message_template: msgTemplate };
      if (twilioSid.trim().length > 0) smsPatch.twilio_account_sid = twilioSid.trim();
      if (twilioToken.trim().length > 0) smsPatch.twilio_auth_token = twilioToken.trim();
      smsPatch.twilio_from = twilioFrom.trim();
      smsPatch.http_url = httpUrl.trim();
      smsPatch.http_method = httpMethod;
      smsPatch.http_content_type = httpContentType.trim() || "application/json";
      smsPatch.http_body_template = httpBodyTpl;
      // Parse "Header-Name: value" lines into an object.
      if (httpHeadersRaw.trim().length > 0) {
        const obj: Record<string, string> = {};
        httpHeadersRaw.split(/\n+/).forEach((line) => {
          const m = line.match(/^([^:]+):\s*(.+)$/);
          if (m) obj[m[1].trim()] = m[2].trim();
        });
        smsPatch.http_headers = obj;
      }
      patch.sms = smsPatch;

      const updated: any = await api.adminUpdateSettings(patch);
      setSettings(updated);
      setSecretOverride("");
      setTwilioSid("");
      setTwilioToken("");
      setHttpHeadersRaw("");
      Alert.alert("✓", "Settings saved");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const testSms = async () => {
    if (!smsTestPhone.trim()) {
      Alert.alert("Phone required", "Enter an Algerian mobile number (e.g. 0555 12 34 56) first.");
      return;
    }
    setSmsTestBusy(true);
    try {
      const res: any = await api.adminTestSms(smsTestPhone.trim());
      if (res.ok) {
        Alert.alert("✓ SMS sent", `Provider: ${res.provider}${res.sid ? `\nSID: ${res.sid}` : ""}${res.http_status ? `\nHTTP: ${res.http_status}` : ""}`);
      } else {
        Alert.alert("✗ Send failed", res.error || "Unknown error");
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed");
    } finally {
      setSmsTestBusy(false);
    }
  };

  const clearSecretOverride = () => {
    Alert.alert(
      "Clear DB secret override?",
      "The Chargily secret key will fall back to the value stored in the server .env file.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await api.adminUpdateSettings({ chargily_secret_key_override: "" });
              await load();
              Alert.alert("✓", "Override cleared. Using .env key.");
            } catch (e: any) {
              Alert.alert("Error", e?.message || "Failed");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const runHealth = async () => {
    setHealthBusy(true);
    try {
      const h: any = await api.adminChargilyHealth();
      setHealth(h);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed");
    } finally {
      setHealthBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={26} color={theme.colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Platform settings</Text>
          <Text style={styles.subtitle}>Chargily · pricing · trial · payments</Text>
        </View>
        <Pressable onPress={load} hitSlop={12}>
          <Ionicons name="refresh" size={22} color={theme.colors.onSurface} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xl }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}>
          {/* Chargily section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Chargily Pay</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Mode</Text>
              <View style={styles.modeRow}>
                <Pressable
                  onPress={() => setMode("test")}
                  style={[styles.modeBtn, mode === "test" && styles.modeBtnActive]}
                >
                  <Ionicons name="flask" size={14} color={mode === "test" ? theme.colors.brand : theme.colors.muted} />
                  <Text style={[styles.modeBtnText, mode === "test" && { color: theme.colors.onSurface }]}>Test</Text>
                </Pressable>
                <Pressable
                  onPress={() => setMode("live")}
                  style={[styles.modeBtn, mode === "live" && styles.modeBtnActive]}
                >
                  <Ionicons name="rocket" size={14} color={mode === "live" ? theme.colors.warning : theme.colors.muted} />
                  <Text style={[styles.modeBtnText, mode === "live" && { color: theme.colors.onSurface }]}>Live</Text>
                </Pressable>
              </View>
              <Text style={styles.help}>
                Test uses sandbox URLs and won&apos;t charge real money. Live goes to the production Chargily endpoint.
              </Text>
            </View>

            <View style={styles.field}>
              <View style={styles.rowBetween}>
                <Text style={styles.label}>Secret key</Text>
                <View style={[styles.sourcePill, { backgroundColor: (settings?.chargily_secret_key_source === "env" ? theme.colors.success : settings?.chargily_secret_key_source === "db" ? theme.colors.warning : theme.colors.error) + "22" }]}>
                  <Text style={[styles.sourcePillText, { color: settings?.chargily_secret_key_source === "env" ? theme.colors.success : settings?.chargily_secret_key_source === "db" ? theme.colors.warning : theme.colors.error }]}>
                    from {settings?.chargily_secret_key_source}
                  </Text>
                </View>
              </View>
              <View style={styles.maskedRow}>
                <Ionicons name="key" size={14} color={theme.colors.muted} />
                <Text style={styles.masked}>{settings?.chargily_secret_key_masked || "not configured"}</Text>
              </View>

              <View style={styles.warnCard}>
                <Ionicons name="warning" size={14} color={theme.colors.warning} />
                <Text style={styles.warnText}>
                  For security, the Chargily secret key should live in the server <Text style={{ fontWeight: "800" }}>.env</Text> file. Overriding it here stores it in the database — only do this if you fully understand the risks.
                </Text>
              </View>

              <View style={styles.secretInputRow}>
                <TextInput
                  value={secretOverride}
                  onChangeText={setSecretOverride}
                  placeholder="Paste secret key to override .env (optional)"
                  placeholderTextColor={theme.colors.muted}
                  secureTextEntry={!showSecret}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
                <Pressable onPress={() => setShowSecret((s) => !s)} hitSlop={8} style={styles.eyeBtn}>
                  <Ionicons name={showSecret ? "eye-off" : "eye"} size={18} color={theme.colors.muted} />
                </Pressable>
              </View>

              {settings?.chargily_secret_key_source === "db" && (
                <Pressable onPress={clearSecretOverride} style={styles.linkBtn}>
                  <Ionicons name="trash" size={12} color={theme.colors.error} />
                  <Text style={[styles.linkBtnText, { color: theme.colors.error }]}>Clear DB override (revert to .env)</Text>
                </Pressable>
              )}
            </View>

            <Pressable onPress={runHealth} disabled={health_busy} style={styles.healthBtn}>
              {health_busy ? <ActivityIndicator color={theme.colors.brand} size="small" /> : (
                <>
                  <Ionicons name="pulse" size={14} color={theme.colors.brand} />
                  <Text style={styles.healthBtnText}>Test Chargily connection</Text>
                </>
              )}
            </Pressable>
            {health && (
              <View style={[styles.healthCard, { borderColor: health.healthy ? theme.colors.success : theme.colors.error, backgroundColor: (health.healthy ? theme.colors.success : theme.colors.error) + "18" }]}>
                <Ionicons name={health.healthy ? "checkmark-circle" : "close-circle"} size={16} color={health.healthy ? theme.colors.success : theme.colors.error} />
                <Text style={[styles.healthText, { color: health.healthy ? theme.colors.success : theme.colors.error }]}>
                  {health.detail} {health.http_status ? `(HTTP ${health.http_status})` : ""}
                </Text>
              </View>
            )}
          </View>

          {/* Pricing section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Subscription plan</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Monthly price (DZD)</Text>
              <TextInput
                value={price}
                onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                style={styles.input}
                placeholder="1000"
                placeholderTextColor={theme.colors.muted}
              />
              <Text style={styles.help}>Amount charged to providers per month. Changes apply to new checkouts.</Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Free trial (days)</Text>
              <TextInput
                value={trial}
                onChangeText={(v) => setTrial(v.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                style={styles.input}
                placeholder="90"
                placeholderTextColor={theme.colors.muted}
              />
              <Text style={styles.help}>Days from signup until the first payment is due.</Text>
            </View>
          </View>

          {/* SMS provider section */}
          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>SMS provider (OTP delivery)</Text>
              <View
                style={[
                  styles.sourcePill,
                  {
                    backgroundColor:
                      (settings?.sms?.healthy ? theme.colors.success : theme.colors.warning) + "22",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.sourcePillText,
                    { color: settings?.sms?.healthy ? theme.colors.success : theme.colors.warning },
                  ]}
                >
                  {settings?.sms?.provider ?? "mock"}
                </Text>
              </View>
            </View>
            {!!settings?.sms?.detail && (
              <Text style={styles.help}>{settings.sms.detail}</Text>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Provider</Text>
              <View style={styles.modeRow}>
                {(["mock", "twilio", "http"] as const).map((p) => (
                  <Pressable
                    key={p}
                    testID={`sms-provider-${p}`}
                    onPress={() => setSmsProvider(p)}
                    style={[styles.modeBtn, smsProvider === p && styles.modeBtnActive]}
                  >
                    <Ionicons
                      name={p === "twilio" ? "cloud" : p === "http" ? "cloud-upload" : "flask"}
                      size={14}
                      color={smsProvider === p ? theme.colors.brand : theme.colors.muted}
                    />
                    <Text
                      style={[
                        styles.modeBtnText,
                        smsProvider === p && { color: theme.colors.onSurface },
                      ]}
                    >
                      {p === "mock" ? "Mock (dev)" : p === "twilio" ? "Twilio" : "HTTP gateway"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.help}>
                {smsProvider === "mock"
                  ? "Mock only logs the code to the server console — safe for development, not for production."
                  : smsProvider === "twilio"
                  ? "Uses Twilio Programmable SMS. Requires Account SID, Auth Token and a from-number."
                  : "Generic HTTP gateway — good for local Algerian SMS providers. Configure URL + body template."}
              </Text>
            </View>

            {smsProvider === "twilio" && (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>Twilio Account SID</Text>
                  {settings?.sms?.twilio_account_sid_masked ? (
                    <View style={styles.maskedRow}>
                      <Ionicons name="key" size={14} color={theme.colors.muted} />
                      <Text style={styles.masked}>{settings.sms.twilio_account_sid_masked}</Text>
                    </View>
                  ) : null}
                  <TextInput
                    testID="sms-twilio-sid"
                    value={twilioSid}
                    onChangeText={setTwilioSid}
                    placeholder={settings?.sms?.twilio_account_sid_masked ? "Leave blank to keep" : "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
                    placeholderTextColor={theme.colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Twilio Auth Token</Text>
                  <View style={styles.secretInputRow}>
                    <TextInput
                      testID="sms-twilio-token"
                      value={twilioToken}
                      onChangeText={setTwilioToken}
                      placeholder={settings?.sms?.twilio_account_sid_masked ? "Leave blank to keep" : "your-auth-token"}
                      placeholderTextColor={theme.colors.muted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry={!showTwilioToken}
                      style={styles.input}
                    />
                    <Pressable
                      onPress={() => setShowTwilioToken((s) => !s)}
                      hitSlop={8}
                      style={styles.eyeBtn}
                    >
                      <Ionicons
                        name={showTwilioToken ? "eye-off" : "eye"}
                        size={18}
                        color={theme.colors.muted}
                      />
                    </Pressable>
                  </View>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>From-number</Text>
                  <TextInput
                    testID="sms-twilio-from"
                    value={twilioFrom}
                    onChangeText={setTwilioFrom}
                    placeholder="+14155552671"
                    placeholderTextColor={theme.colors.muted}
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                    style={styles.input}
                  />
                  <Text style={styles.help}>
                    A verified Twilio number or messaging service SID. Must support SMS to Algeria (+213).
                  </Text>
                </View>
              </>
            )}

            {smsProvider === "http" && (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>Gateway URL</Text>
                  <TextInput
                    testID="sms-http-url"
                    value={httpUrl}
                    onChangeText={setHttpUrl}
                    placeholder="https://sms.example.dz/api/send"
                    placeholderTextColor={theme.colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    style={styles.input}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>HTTP method</Text>
                  <View style={styles.modeRow}>
                    {(["GET", "POST", "PUT"] as const).map((m) => (
                      <Pressable
                        key={m}
                        onPress={() => setHttpMethod(m)}
                        style={[styles.modeBtn, httpMethod === m && styles.modeBtnActive]}
                      >
                        <Text style={[styles.modeBtnText, httpMethod === m && { color: theme.colors.onSurface }]}>
                          {m}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Content-Type</Text>
                  <TextInput
                    testID="sms-http-ctype"
                    value={httpContentType}
                    onChangeText={setHttpContentType}
                    placeholder="application/json"
                    placeholderTextColor={theme.colors.muted}
                    autoCapitalize="none"
                    style={styles.input}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Body template</Text>
                  <TextInput
                    testID="sms-http-body"
                    value={httpBodyTpl}
                    onChangeText={setHttpBodyTpl}
                    multiline
                    numberOfLines={4}
                    placeholder={'{"to": "{phone}", "text": "{message}"}'}
                    placeholderTextColor={theme.colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[styles.input, { height: 90, textAlignVertical: "top" }]}
                  />
                  <Text style={styles.help}>
                    Placeholders: {"{phone}"} = E.164 number, {"{message}"} = the localized OTP text.
                  </Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Extra headers (one per line, `Name: value`)</Text>
                  {settings?.sms?.http_header_keys && settings.sms.http_header_keys.length > 0 && (
                    <Text style={styles.help}>
                      Currently stored: {settings.sms.http_header_keys.join(", ")} (values hidden)
                    </Text>
                  )}
                  <TextInput
                    testID="sms-http-headers"
                    value={httpHeadersRaw}
                    onChangeText={setHttpHeadersRaw}
                    multiline
                    numberOfLines={3}
                    placeholder={"Authorization: Bearer XXX\nX-API-Key: XXX"}
                    placeholderTextColor={theme.colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[styles.input, { height: 72, textAlignVertical: "top" }]}
                  />
                </View>
              </>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Message template</Text>
              <TextInput
                testID="sms-msg-template"
                value={msgTemplate}
                onChangeText={setMsgTemplate}
                placeholder="khedmaPro: your verification code is {code}. Valid 5 minutes."
                placeholderTextColor={theme.colors.muted}
                multiline
                numberOfLines={2}
                style={[styles.input, { height: 72, textAlignVertical: "top" }]}
              />
              <Text style={styles.help}>
                Uses placeholders {"{code}"} and {"{phone}"}. Leave blank to use the default template.
              </Text>
            </View>

            {/* Test send row */}
            <View style={styles.field}>
              <Text style={styles.label}>Send test SMS to</Text>
              <View style={styles.secretInputRow}>
                <TextInput
                  testID="sms-test-phone"
                  value={smsTestPhone}
                  onChangeText={setSmsTestPhone}
                  placeholder="0555 12 34 56"
                  placeholderTextColor={theme.colors.muted}
                  keyboardType="phone-pad"
                  style={styles.input}
                />
                <Pressable
                  testID="sms-test-btn"
                  onPress={testSms}
                  disabled={smsTestBusy}
                  style={[styles.healthBtn, { paddingHorizontal: 14, borderColor: theme.colors.brand }]}
                >
                  {smsTestBusy ? (
                    <ActivityIndicator color={theme.colors.brand} size="small" />
                  ) : (
                    <>
                      <Ionicons name="paper-plane" size={14} color={theme.colors.brand} />
                      <Text style={styles.healthBtnText}>Send</Text>
                    </>
                  )}
                </Pressable>
              </View>
              <Text style={styles.help}>
                Sends the fixed test code `000000` via the CURRENTLY saved settings.
              </Text>
            </View>
          </View>

          {/* Payments master switch */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Master switch</Text>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Payments enabled</Text>
                <Text style={styles.help}>Turn OFF during maintenance. Blocks new checkouts but keeps existing subscriptions active.</Text>
              </View>
              <Switch
                value={payEnabled}
                onValueChange={setPayEnabled}
                trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
                thumbColor="#fff"
              />
            </View>
          </View>

          {/* Save */}
          <Pressable onPress={save} disabled={busy} style={[styles.saveBtn, busy && { opacity: 0.5 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="save" size={16} color="#fff" />
                <Text style={styles.saveBtnText}>Save settings</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: "row", alignItems: "center", padding: theme.spacing.xl, gap: theme.spacing.md },
  title: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "800" },
  subtitle: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md },
  emptyText: { color: theme.colors.muted, fontSize: 14 },

  section: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  sectionTitle: { color: theme.colors.onSurface, fontSize: 14, fontWeight: "800" },

  field: { gap: 6 },
  label: { color: theme.colors.onSurface, fontSize: 13, fontWeight: "700" },
  help: { color: theme.colors.muted, fontSize: 11, lineHeight: 15 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    color: theme.colors.onSurface,
    backgroundColor: theme.colors.surface,
    fontSize: 14,
  },

  modeRow: { flexDirection: "row", gap: theme.spacing.sm },
  modeBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    padding: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modeBtnActive: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandTertiary },
  modeBtnText: { color: theme.colors.onSurfaceSecondary, fontSize: 13, fontWeight: "700" },

  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sourcePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.pill },
  sourcePillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  maskedRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  masked: { color: theme.colors.onSurfaceSecondary, fontFamily: "monospace", fontSize: 13 },

  warnCard: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.warning + "18",
    borderWidth: 1,
    borderColor: theme.colors.warning + "44",
  },
  warnText: { color: theme.colors.onSurface, fontSize: 12, lineHeight: 17, flex: 1 },

  secretInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyeBtn: { padding: 8 },

  linkBtn: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 4 },
  linkBtnText: { fontSize: 12, fontWeight: "700" },

  healthBtn: {
    flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center",
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.brand,
  },
  healthBtnText: { color: theme.colors.brand, fontWeight: "800", fontSize: 13 },
  healthCard: {
    flexDirection: "row", gap: 6, alignItems: "center",
    padding: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
  },
  healthText: { fontSize: 12, fontWeight: "700", flex: 1 },

  toggleRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },

  saveBtn: {
    height: 50, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 8,
  },
  saveBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "800", fontSize: 15 },
});
