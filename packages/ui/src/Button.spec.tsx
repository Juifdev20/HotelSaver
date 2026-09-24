import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "./Button";

describe("Button", () => {
  it("affiche son contenu et répond au clic", () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Enregistrer</Button>);

    const bouton = screen.getByRole("button", { name: "Enregistrer" });
    fireEvent.click(bouton);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applique la variante primary par défaut", () => {
    render(<Button>Valider</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("data-variant", "primary");
  });

  it("applique la variante et la taille demandées", () => {
    render(
      <Button variant="danger" size="lg">
        Supprimer
      </Button>
    );
    const bouton = screen.getByRole("button");
    expect(bouton).toHaveAttribute("data-variant", "danger");
    expect(bouton).toHaveAttribute("data-size", "lg");
    expect(bouton.className).toContain("hc-button--danger");
    expect(bouton.className).toContain("hc-button--lg");
  });

  it("est désactivé quand disabled est passé, et n'appelle pas onClick", () => {
    const onClick = jest.fn();
    render(
      <Button disabled onClick={onClick}>
        Indisponible
      </Button>
    );
    const bouton = screen.getByRole("button");
    expect(bouton).toBeDisabled();
    fireEvent.click(bouton);
    expect(onClick).not.toHaveBeenCalled();
  });
});
