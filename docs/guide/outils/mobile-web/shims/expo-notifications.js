// expo-notifications : aucune notification système dans un navigateur de capture. Les notifications DE L'APPLICATION (cloche, centre
// de notifications, alimentés par la synchronisation) fonctionnent normalement ; seuls le jeton push et les canaux Android sont neutres.
const vide = async () => undefined;
export const AndroidImportance = { UNKNOWN: 0, UNSPECIFIED: -1000, NONE: 0, MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4, MAX: 5 };
export const AndroidNotificationVisibility = { UNKNOWN: 0, PUBLIC: 1, PRIVATE: 0, SECRET: -1 };
export const setNotificationHandler = () => {};
export const setNotificationChannelAsync = vide;
export const getPermissionsAsync = async () => ({ granted: false, canAskAgain: true, status: "undetermined" });
export const requestPermissionsAsync = async () => ({ granted: false, canAskAgain: false, status: "denied" });
export const getDevicePushTokenAsync = async () => { throw new Error("Notifications push indisponibles dans le navigateur."); };
export const addPushTokenListener = () => ({ remove() {} });
export const getLastNotificationResponse = () => null;
export const clearLastNotificationResponse = () => {};
export const addNotificationResponseReceivedListener = () => ({ remove() {} });
export const addNotificationReceivedListener = () => ({ remove() {} });
export const dismissAllNotificationsAsync = vide;
export const setBadgeCountAsync = vide;
