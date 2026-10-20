// react-native-bluetooth-classic : pas de Bluetooth. Le Bluetooth est déclaré « éteint » : l'écran Imprimante affiche alors le message que
// l'application montre vraiment dans ce cas.
// `window.__HS_BLUETOOTH__ = { actif: true, appareils: [{ name, address }] }` (posé avant le chargement, voir mobile.cjs : option `imprimantes`)
// simule des imprimantes DÉJÀ APPAIRÉES ; par défaut le Bluetooth est éteint.
const bt = () => globalThis.__HS_BLUETOOTH__ ?? { actif: false, appareils: [] };
const RNBluetoothClassic = {
  isBluetoothEnabled: async () => bt().actif,
  requestBluetoothEnabled: async () => false,
  getBondedDevices: async () => bt().appareils,
  isDeviceConnected: async () => false,
  getConnectedDevice: async () => { throw new Error("Bluetooth indisponible dans le navigateur."); },
  connectToDevice: async () => { throw new Error("Bluetooth indisponible dans le navigateur."); },
  disconnectFromDevice: async () => false,
  cancelDiscovery: async () => false,
};
export default RNBluetoothClassic;
export class BluetoothDevice {}
