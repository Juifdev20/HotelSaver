import type { ApiPreload } from "../../preload";

declare global {
  interface Window {
    hotelChicago: ApiPreload;
  }
}
