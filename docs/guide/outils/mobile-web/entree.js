// Point d'entrée web : équivalent de apps/mobile/index.ts (registerRootComponent) pour react-native-web.
import { AppRegistry } from "react-native-web";
import App from "@app/App";

AppRegistry.registerComponent("main", () => App);
AppRegistry.runApplication("main", { rootTag: document.getElementById("root") });
