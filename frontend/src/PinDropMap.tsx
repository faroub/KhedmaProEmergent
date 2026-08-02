import React, { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { WebView } from "react-native-webview";

export type PinHandle = { setCenter: (lat: number, lng: number) => void };

type Props = {
  initialLat: number;
  initialLng: number;
  onPinChange?: (lat: number, lng: number) => void;
  height?: number;
  testID?: string;
};

/**
 * Interactive OpenStreetMap via Leaflet inside a WebView.
 * Works in Expo Go, web, and native builds — no API key required.
 */
export const PinDropMap = forwardRef<PinHandle, Props>(
  ({ initialLat, initialLng, onPinChange, height = 300, testID }, ref) => {
    const webRef = useRef<WebView | null>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);

    const html = useMemo(
      () => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background: #0B1120; }
  .leaflet-container { background: #0B1120; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var lat = ${initialLat};
  var lng = ${initialLng};
  var map = L.map('map', { zoomControl: true, attributionControl: false }).setView([lat, lng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  var marker = L.marker([lat, lng], { draggable: true }).addTo(map);

  function send(lat, lng) {
    var payload = JSON.stringify({ lat: lat, lng: lng });
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(payload);
    } else if (window.parent) {
      window.parent.postMessage(payload, '*');
    }
  }

  marker.on('dragend', function (e) {
    var pos = marker.getLatLng();
    send(pos.lat, pos.lng);
  });
  map.on('click', function (e) {
    marker.setLatLng(e.latlng);
    send(e.latlng.lat, e.latlng.lng);
  });
  window.__setCenter = function (lat, lng) {
    map.setView([lat, lng], 15);
    marker.setLatLng([lat, lng]);
  };
</script>
</body>
</html>`,
      [initialLat, initialLng]
    );

    useImperativeHandle(ref, () => ({
      setCenter: (lat: number, lng: number) => {
        const js = `window.__setCenter(${lat}, ${lng}); true;`;
        if (Platform.OS === "web") {
          iframeRef.current?.contentWindow?.postMessage({ setCenter: [lat, lng] }, "*");
        } else {
          webRef.current?.injectJavaScript(js);
        }
      },
    }));

    // On web, receive messages via window.postMessage
    React.useEffect(() => {
      if (Platform.OS !== "web" || !onPinChange) return;
      const listener = (e: MessageEvent) => {
        try {
          const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
          if (data && typeof data.lat === "number" && typeof data.lng === "number") {
            onPinChange(data.lat, data.lng);
          }
        } catch {}
      };
      window.addEventListener("message", listener);
      return () => window.removeEventListener("message", listener);
    }, [onPinChange]);

    if (Platform.OS === "web") {
      return (
        <View style={[styles.wrap, { height }]} testID={testID}>
          <iframe
            ref={iframeRef}
            srcDoc={html}
            style={{ width: "100%", height: "100%", border: 0, background: "#0B1120" }}
          />
        </View>
      );
    }

    return (
      <View style={[styles.wrap, { height }]} testID={testID}>
        <WebView
          ref={webRef}
          originWhitelist={["*"]}
          source={{ html }}
          style={{ backgroundColor: "#0B1120" }}
          onMessage={(e) => {
            try {
              const d = JSON.parse(e.nativeEvent.data);
              if (typeof d.lat === "number" && typeof d.lng === "number") {
                onPinChange?.(d.lat, d.lng);
              }
            } catch {}
          }}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  wrap: { borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#1E2B45", backgroundColor: "#0B1120" },
});
