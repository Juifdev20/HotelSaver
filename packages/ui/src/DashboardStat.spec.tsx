import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { DashboardStat } from "./DashboardStat";

describe("DashboardStat", () => {
  it("affiche le libellé, la valeur et la précision", () => {
    render(<DashboardStat libelle="Occupation" valeur="75 %" precision="6 chambres sur 8" />);
    expect(screen.getByText("Occupation")).toBeInTheDocument();
    expect(screen.getByText("75 %")).toBeInTheDocument();
    expect(screen.getByText("6 chambres sur 8")).toBeInTheDocument();
  });

  it("n'est pas interactive sans onClick", () => {
    render(<DashboardStat libelle="Libres" valeur={4} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("devient un bouton de filtre avec onClick, et expose son état sélectionné", () => {
    const onClick = jest.fn();
    render(<DashboardStat libelle="Libres" valeur={4} tone="success" onClick={onClick} selectionne />);

    const bouton = screen.getByRole("button", { name: /Libres/ });
    expect(bouton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(bouton);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("garde toujours le mot à côté de la pastille de couleur", () => {
    const { container } = render(<DashboardStat libelle="Occupées" valeur={2} tone="danger" />);
    expect(container.querySelector(".hc-stat__pastille--danger")).not.toBeNull();
    expect(screen.getByText("Occupées")).toBeInTheDocument();
  });
});
