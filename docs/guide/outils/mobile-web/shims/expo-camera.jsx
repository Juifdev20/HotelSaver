// expo-camera : pas de caméra de capture. CameraView montre un cadre sombre « Caméra non disponible » à la place de l'image.
import * as React from "react";
import { View, Text } from "react-native-web";
export function CameraView({ style, children }) {
  return (
    <View style={[{ backgroundColor: "#0b0f14", alignItems: "center", justifyContent: "center" }, style]}>
      <Text style={{ color: "#9aa7b8", fontSize: 14 }}>Caméra non disponible (aperçu navigateur)</Text>
      {children}
    </View>
  );
}
export const useCameraPermissions = () => [{ granted: true, canAskAgain: true, status: "granted" }, async () => ({ granted: true })];
export const Camera = { requestCameraPermissionsAsync: async () => ({ granted: true }) };
