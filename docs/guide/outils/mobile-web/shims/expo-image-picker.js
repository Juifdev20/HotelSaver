// expo-image-picker : la galerie du téléphone n'existe pas ; le choix est toujours « annulé ».
export const launchImageLibraryAsync = async () => ({ canceled: true, assets: null });
export const launchCameraAsync = async () => ({ canceled: true, assets: null });
export const requestMediaLibraryPermissionsAsync = async () => ({ granted: true });
export const MediaTypeOptions = { All: "All", Images: "Images", Videos: "Videos" };
