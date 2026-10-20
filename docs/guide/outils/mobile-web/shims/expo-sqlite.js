// expo-sqlite n'est pas utilisable dans un navigateur : la copie locale passe par IndexedDB (voir baseLocale.web.ts).
export const openDatabaseAsync = async () => { throw new Error("expo-sqlite n'existe pas sur le web : voir shims/baseLocale.web.ts"); };
