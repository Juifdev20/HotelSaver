// Remplace Alert.alert (no-op sur le web) par une boîte de dialogue Android (Material) : le système, pas l'application, dessine
// ces boîtes sur le téléphone ; ici on les dessine en HTML pour pouvoir les photographier.
export function alerte(titre, message, boutons, options) {
  const liste = boutons && boutons.length ? boutons : [{ text: "OK" }];
  const fond = document.createElement("div");
  fond.setAttribute("role", "alertdialog");
  fond.setAttribute("aria-label", titre || "Alerte");
  fond.setAttribute("data-alerte", "1");
  fond.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.32);display:flex;align-items:center;justify-content:center;z-index:99999;font-family:Roboto,sans-serif";
  const carte = document.createElement("div");
  carte.style.cssText = "background:#fff;color:#1d1b20;border-radius:28px;padding:24px 24px 18px;width:min(312px,calc(100% - 48px));box-shadow:0 6px 24px rgba(0,0,0,.28)";
  const h = document.createElement("div");
  h.textContent = titre || "";
  h.style.cssText = "font-size:24px;line-height:32px;margin-bottom:16px";
  const p = document.createElement("div");
  p.textContent = message || "";
  p.style.cssText = "font-size:14px;line-height:20px;color:#49454f;margin-bottom:24px;white-space:pre-line";
  const b = document.createElement("div");
  b.style.cssText = "display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px";
  const fermer = () => fond.remove();
  for (const bouton of liste) {
    const e = document.createElement("button");
    e.type = "button";
    e.textContent = bouton.text ?? "OK";
    e.style.cssText = `border:0;background:none;font:500 14px Roboto,sans-serif;padding:10px 12px;border-radius:20px;cursor:pointer;color:${bouton.style === "destructive" ? "#b3261e" : "#1769E0"}`;
    e.onclick = () => { fermer(); bouton.onPress?.(); };
    b.appendChild(e);
  }
  carte.append(...(titre ? [h] : []), ...(message ? [p] : []), b);
  fond.appendChild(carte);
  if (options?.cancelable !== false) fond.addEventListener("click", (ev) => { if (ev.target === fond) { fermer(); options?.onDismiss?.(); } });
  document.body.appendChild(fond);
}
