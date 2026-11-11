// Doit rester le PREMIER import : il installe la lecture des styles à travers le thème (mode sombre) avant que les écrans ne créent leurs styles.
import './src/theme/installer';

import { registerRootComponent } from 'expo';
import * as SplashScreen from 'expo-splash-screen';

import { Racine } from './src/theme/Racine';

// Le splash natif (badge HotelSaver sur navy #053483) reste affiché jusqu'à
// ce que l'écran « chargement » JS — même logo, même fond — soit peint :
// pas d'écran noir intermédiaire au démarrage (see App.tsx, onLayout).
SplashScreen.preventAutoHideAsync().catch(() => {});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Racine);
