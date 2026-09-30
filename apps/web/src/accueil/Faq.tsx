import * as React from "react";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { EnteteSection } from "./Sections";
import { Apparition } from "./animations";
import { FAQ } from "./donnees";

export function Faq() {
  const [ouverte, setOuverte] = useState<number | null>(0);
  const reduit = useReducedMotion();

  return (
    <section id="faq" className="section section--etroite">
      <EnteteSection etiquette="FAQ" titre="Questions fréquentes" />
      <Apparition>
        <div className="faq">
          {FAQ.map((q, i) => {
            const estOuverte = ouverte === i;
            return (
              <div key={q.question} className={`faq__item ${estOuverte ? "faq__item--ouvert" : ""}`}>
                <h3>
                  <button
                    type="button"
                    className="faq__question"
                    aria-expanded={estOuverte}
                    aria-controls={`faq-${i}`}
                    onClick={() => setOuverte(estOuverte ? null : i)}
                  >
                    {q.question}
                    <span className="faq__signe" aria-hidden="true" />
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {estOuverte && (
                    <motion.div
                      id={`faq-${i}`}
                      key="contenu"
                      initial={reduit ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={reduit ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      style={{ overflow: "hidden" }}
                    >
                      <p className="faq__reponse">{q.reponse}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </Apparition>
    </section>
  );
}
