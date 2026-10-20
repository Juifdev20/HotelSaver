// expo-secure-store -> localStorage (préfixe dédié). Le coffre du téléphone n'existe pas dans un navigateur.
const cle = (k) => `securestore:${k}`;
export const getItemAsync = async (k) => globalThis.localStorage.getItem(cle(k));
export const setItemAsync = async (k, v) => void globalThis.localStorage.setItem(cle(k), String(v));
export const deleteItemAsync = async (k) => void globalThis.localStorage.removeItem(cle(k));
export const isAvailableAsync = async () => true;
export const getItem = (k) => globalThis.localStorage.getItem(cle(k));
export const setItem = (k, v) => void globalThis.localStorage.setItem(cle(k), String(v));
export const WHEN_UNLOCKED = 0, AFTER_FIRST_UNLOCK = 1, ALWAYS = 2, WHEN_UNLOCKED_THIS_DEVICE_ONLY = 3, AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 4, ALWAYS_THIS_DEVICE_ONLY = 5, WHEN_PASSCODE_SET_THIS_DEVICE_ONLY = 6;
