const {
  withMainActivity,
  withAppBuildGradle,
  withMainApplication,
} = require("expo/config-plugins");

const IMPORTS = `import android.os.Bundle
import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.facebook.react.bridge.ReactMarker
import com.facebook.react.bridge.ReactMarkerConstants`;

const APPEL = `    // expo-splash-screen bloque tout draw de la fenêtre tant que le JS n'a
    // pas rendu sa première image (OnPreDrawListener) : pendant tout le
    // chargement du bundle, la surface n'est jamais dessinée et
    // SurfaceFlinger affiche du noir — le « flash noir » au démarrage. On
    // débloque le draw immédiatement puis on pose notre propre voile
    // (même navy, même logo à la même taille que le splash natif) au-dessus
    // de la decorView ; il n'est retiré que quand React signale son premier
    // rendu réel (CONTENT_APPEARED) — la transition est alors invisible.
    SplashScreenManager.hide()
    ajouterVoileDemarrage()`;

const METHODES = `
  private var voileDemarrage: FrameLayout? = null
  private var ecouteurDemarrage: ReactMarker.MarkerListener? = null

  /** Voile navy + logo + slogan : porte à lui seul le premier écran de la
   * séquence de démarrage (« façon Facebook », voir App.tsx). Un essai
   * précédent affichait le même contenu une seconde fois côté JS
   * (EcranAccueil) une fois le bundle prêt — deux rendus indépendants
   * (Kotlin puis React) du même logo+slogan donnaient l'impression d'un
   * doublon à l'écran, même à contenu identique. Le voile est donc
   * désormais le SEUL rendu de cet écran ; App.tsx passe directement à son
   * écran de chargement (logo réduit + spinner), un contenu différent, donc
   * jamais perçu comme une répétition. */
  private fun ajouterVoileDemarrage() {
    val decor = window.decorView as? ViewGroup ?: return
    val debutVoile = System.currentTimeMillis()
    val taille = (220 * resources.displayMetrics.density).toInt()
    val voile = FrameLayout(this).apply {
      setBackgroundColor(Color.parseColor("#053483"))
    }
    val contenu = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
    }
    contenu.addView(
      ImageView(this).apply {
        setImageResource(R.drawable.splashscreen_logo)
        scaleType = ImageView.ScaleType.FIT_CENTER
      },
      LinearLayout.LayoutParams(taille, taille)
    )
    contenu.addView(
      TextView(this).apply {
        text = "La gestion complète de votre hôtel, simplifiée."
        setTextColor(Color.WHITE)
        textSize = 16f
        gravity = Gravity.CENTER
        typeface = Typeface.DEFAULT_BOLD
      },
      LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        topMargin = (24 * resources.displayMetrics.density).toInt()
        marginStart = (32 * resources.displayMetrics.density).toInt()
        marginEnd = (32 * resources.displayMetrics.density).toInt()
      }
    )
    voile.addView(
      contenu,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.WRAP_CONTENT,
        FrameLayout.LayoutParams.WRAP_CONTENT,
        Gravity.CENTER
      )
    )
    decor.addView(
      voile,
      ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    )
    voileDemarrage = voile
    voile.bringToFront()

    val ecouteur = ReactMarker.MarkerListener { nom, _, _ ->
      if (nom == ReactMarkerConstants.CONTENT_APPEARED) {
        ecouteurDemarrage?.let { ReactMarker.removeListener(it) }
        ecouteurDemarrage = null
        // Ce voile PORTE le premier écran (logo+slogan) : il reste affiché au
        // moins 1500 ms au total, même si le JS est prêt bien avant — sans
        // quoi le premier écran de la séquence flasherait trop vite pour être
        // lu. 600 ms de marge minimum : CONTENT_APPEARED signale qu'un premier
        // commit React existe, pas qu'il est déjà réellement composé à
        // l'écran — sans cette marge, un fond bleu nu apparaît le temps que
        // la vraie peinture rattrape le commit (mesuré sur appareil : cet
        // écart varie fortement, de quelques centaines de ms à plusieurs
        // secondes selon la charge de l'appareil — aucune marge fixe ne
        // l'élimine à coup sûr sur un appareil déjà très sollicité).
        val ecoule = System.currentTimeMillis() - debutVoile
        val attente = maxOf(1_500L - ecoule, 600L)
        voile.postDelayed({ retirerVoile(voile) }, attente)
      }
    }
    ecouteurDemarrage = ecouteur
    ReactMarker.addListener(ecouteur)

    // Filet de sécurité : si le JS ne rend jamais (crash), on retire quand
    // même le voile après 60 s pour ne pas bloquer l'écran indéfiniment.
    voile.postDelayed({ retirerVoile(voile) }, 60_000)
  }

  private fun retirerVoile(voile: FrameLayout) {
    if (voileDemarrage !== voile) return
    voileDemarrage = null
    voile.animate().alpha(0f).setDuration(150).withEndAction {
      (voile.parent as? ViewGroup)?.removeView(voile)
    }.start()
  }
`;

/** Plugin Expo — démarrage sans écran noir et debug embarqué.
 *
 * Deux injections :
 *
 * A) MainActivity.kt : élimine le flash noir au démarrage. Cause mesurée sur
 *    appareil : expo-splash-screen bloque le premier draw de la fenêtre tant
 *    que le JS n'a pas rendu (OnPreDrawListener) — pendant le chargement du
 *    bundle, SurfaceFlinger compose une surface jamais dessinée = noir.
 *    On débloque le draw (SplashScreenManager.hide()) puis on pose un voile
 *    navy + logo HotelSaver au-dessus de la decorView, retiré en fondu quand
 *    CONTENT_APPEARED signale le premier rendu JS réel.
 *
 * B) app/build.gradle : `debuggableVariants = []` — même le build debug
 *    embarque son bundle JS (export:embed). Le lancement ne dépend alors
 *    plus de Metro ni d'adb reverse : ~2-3 s au lieu de ~60-80 s sur
 *    appareil modeste. Conséquence : pas de rechargement à chaud — tout
 *    changement JS demande un rebuild (~3 min). Pour itérer vite, repasser
 *    la valeur à `["debug"]` le temps du développement.
 *
 * Un troisième problème (le « fantôme » : la Starting Window système affiche
 * l'icône à une taille fixe ~288 dp, plus grande que notre voile 171 dp, le
 * temps d'un fondu système) N'EST PAS traité ici : `android:windowDisablePreview`
 * doit être ajouté à `Theme.App.SplashScreen`, mais ce style est régénéré par
 * expo-splash-screen à une étape fixe de `expo prebuild`, plus tardive que
 * n'importe quel mod de plugin (testé : un item poussé depuis `withAndroidStyles`
 * ou `withDangerousMod` est systématiquement écrasé, quelle que soit sa position
 * dans `app.json`). Voir `scripts/patch-native-splash.js`, qui patche le fichier
 * généré une fois `expo prebuild` terminé.
 *
 * android/ est gitignoré (régénéré par `expo prebuild`) : ce plugin recrée
 * le code à chaque prebuild, aucune modification manuelle à reporter. */
module.exports = function withSurfaceTranslucide(config) {
  config = withMainActivity(config, (cfg) => {
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

  config = withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    // Le template contient déjà « debuggableVariants » en commentaire —
    // on ne saute que si une ligne ACTIVE existe.
    if (/^\s*debuggableVariants\s*=/m.test(src)) return cfg;
    // Bundle JS embarqué aussi en debug : voir l'en-tête du plugin.
    src = src.replace(
      /react \{/,
      "react {\n    debuggableVariants = []"
    );
    cfg.modResults.contents = src;
    return cfg;
  });

  // MainApplication.kt : sans ça, le build debug vérifie encore Metro
  // (isMetroRunning → « Reloading… » ~60 s sur appareil modeste) même si le
  // bundle est embarqué. useDevSupport=false = comportement production.
  config = withMainApplication(config, (cfg) => {
    if (cfg.modResults.language !== "kt") return cfg;
    let src = cfg.modResults.contents;
    if (src.includes("useDevSupport = false")) return cfg;
    src = src.replace(
      "context = applicationContext,",
      "context = applicationContext,\n      useDevSupport = false,"
    );
    cfg.modResults.contents = src;
    return cfg;
  });

  return config;
};
