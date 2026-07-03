import { CameraView, useCameraPermissions } from "expo-camera";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button, Header, Hero, Screen } from "@/components/ui";
import { palette, space } from "@/constants/theme";
import { useAppState } from "@/data/AppState";
export function CameraLogScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const { addFood } = useAppState();
  return (
    <Screen>
      <Header eyebrow="Snap" title="Scan food." />
      {permission?.granted ? (
        <>
          <CameraView
            style={{ height: 360, borderRadius: 28, overflow: "hidden" }}
            barcodeScannerSettings={{
              barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "qr"],
            }}
            onBarcodeScanned={
              scanned
                ? undefined
                : () => {
                    setScanned(true);
                    addFood({
                      name: "Scanned grocery item",
                      meal: "snack",
                      calories: 240,
                      protein: 12,
                      carbs: 28,
                      fat: 8,
                    });
                  }
            }
          />
          <View style={{ height: space.md }} />
          <Text style={{ color: palette.muted, lineHeight: 22 }}>
            Point the camera at a barcode. A production food lookup can replace
            the local placeholder without changing this screen contract.
          </Text>
          <Button
            label={scanned ? "Scan another" : "Ready to scan"}
            onPress={() => setScanned(false)}
          />
        </>
      ) : (
        <Hero>
          <Text style={{ fontSize: 18, lineHeight: 28 }}>
            Use the camera to scan barcodes and log meals without leaving the
            native flow.
          </Text>
          <View style={{ height: space.md }} />
          <Button label="Enable camera" onPress={requestPermission} />
        </Hero>
      )}
    </Screen>
  );
}
