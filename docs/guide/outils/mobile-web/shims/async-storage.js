// @react-native-async-storage/async-storage -> localStorage du navigateur.
const ls = () => globalThis.localStorage;
const AsyncStorage = {
  getItem: async (k) => ls().getItem(k),
  setItem: async (k, v) => void ls().setItem(k, String(v)),
  removeItem: async (k) => void ls().removeItem(k),
  mergeItem: async (k, v) => void ls().setItem(k, JSON.stringify({ ...JSON.parse(ls().getItem(k) ?? "{}"), ...JSON.parse(v) })),
  clear: async () => void ls().clear(),
  getAllKeys: async () => Object.keys(ls()),
  multiGet: async (ks) => ks.map((k) => [k, ls().getItem(k)]),
  multiSet: async (ps) => void ps.forEach(([k, v]) => ls().setItem(k, String(v))),
  multiRemove: async (ks) => void ks.forEach((k) => ls().removeItem(k)),
};
export default AsyncStorage;
export const useAsyncStorage = (k) => ({
  getItem: () => AsyncStorage.getItem(k), setItem: (v) => AsyncStorage.setItem(k, v), removeItem: () => AsyncStorage.removeItem(k), mergeItem: (v) => AsyncStorage.mergeItem(k, v),
});
