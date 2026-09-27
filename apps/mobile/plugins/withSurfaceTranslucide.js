const { withMainActivity } = require("expo/config-plugins");

const IMPORTS = `import android.os.Bundle
import android.graphics.Color
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import com.facebook.react.bridge.ReactMarker
import com.facebook.react.bridge.ReactMarkerConstants`;

const APPEL = `    // expo-splash-screen bloque tout draw de la fenêtre tant que le JS n'a
    // pas rendu sa première image (OnPreDrawListener) : pendant tout le
    // chargement du bundle, la surface n'est jamais dessinée et
    // SurfaceFlinger affiche du noir — le « flash noir » au démarrage. On
    // débloque le draw immédiatement puis on pose notre propre voile
    // (même navy, même logo que le splash natif) au-dessus de la
    // decorView ; il n'est retiré que quand React signale son premier
    // rendu réel (CONTENT_APPEARED) — la transition est alors invisible.
    SplashScreenManager.hide()
    ajouterVoileDemarrage()`;

const METHODES = `
  private var voileDemarrage: ImageView? = null
  private var ecouteurDemarrage: ReactMarker.MarkerListener? = null

  private fun ajouterVoileDemarrage() {
    val decor = window.decorView as? ViewGroup ?: return
    val voile = ImageView(this).apply {
      setImageResource(R.drawable.splashscreen_logo)
      scaleType = ImageView.ScaleType.CENTER
      setBackgroundColor(Color.parseColor("#053483"))
    }
    voile.layoutParams = ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT
    )
    voileDemarrage = voile
    decor.addView(voile)
    voile.bringToFront()

    val ecouteur = ReactMarker.MarkerListener { nom, _, _ ->
      if (nom == ReactMarkerConstants.CONTENT_APPEARED) {
        ecouteurDemarrage?.let { ReactMarker.removeListener(it) }
        ecouteurDemarrage = null
        // Petite marge : la frame JS peut être commise sans être encore
        // composée à l'écran sur les appareils lents.
        voile.postDelayed({
          voile.animate().alpha(0f).setDuration(150).withEndAction {
            (voile.parent as? ViewGroup)?.removeView(voile)
            voileDemarrage = null
          }.start()
        }, 250)
      }
    }
    ecouteurDemarrage = ecouteur
    ReactMarker.addListener(ecouteur)
  }
`;

/** Plugin Expo : élimine le flash noir au démarrage.
 *
 * Cause mesurée sur appareil (captures en rafale) : expo-splash-screen
 * bloque le premier draw de la fenêtre tant que le JS n'a pas rendu
 * (OnPreDrawListener, SplashScreenManager) — pendant le chargement du
 * bundle, SurfaceFlinger compose une surface jamais dessinée = noir.
 *
 * Ce plugin injecte dans MainActivity.kt :
 *  1. SplashScreenManager.hide() juste après onCreate → débloque le draw ;
 *  2. un voile navy + logo HotelSaver ajouté au-dessus de la decorView,
 *     retiré en fondu quand ReactMarker CONTENT_APPEARED signale le premier
 *     rendu JS réel — la transition splash → JS est alors invisible.
 *
 * android/ est gitignoré (régénéré par `expo prebuild`) : ce plugin recrée
 * le code à chaque prebuild, aucune modification manuelle à reporter. */
module.exports = function withSurfaceTranslucide(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== "kt") return cfg;
    let src = cfg.modResults.contents;
    if (src.includes("ajouterVoileDemarrage")) return cfg;
    src = src
      .replace("import android.os.Bundle", IMPORTS)
      .replace("super.onCreate(null)", "super.onCreate(null)\n" + APPEL)
      .replace(/\n}\s*$/, METHODES + "\n}\n");
    cfg.modResults.contents = src;
    return cfg;
  });
};
