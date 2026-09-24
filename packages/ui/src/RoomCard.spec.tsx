import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Devise } from "@hotel-chicago/types";
import { RoomCard } from "./RoomCard";

describe("RoomCard", () => {
  it("affiche le numéro, le type, le prix formaté et le statut", () => {
    render(
      <RoomCard numero="101" type="Standard" prix={45} devise={Devise.USD} statutTone="success" statutLabel="Libre" />
    );

    expect(screen.getByText("101")).toBeInTheDocument();
    expect(screen.getByText("Standard")).toBeInTheDocument();
    expect(screen.getByText("45.00 $")).toBeInTheDocument();
    expect(screen.getByText("Libre")).toBeInTheDocument();
  });

  it("formate un prix en CDF sans décimales via formatMontant, jamais à la main", () => {
    render(
      <RoomCard
        numero="205"
        type="Suite"
        prix={20000}
        devise={Devise.CDF}
        statutTone="danger"
        statutLabel="Occupée"
      />
    );
    expect(screen.getByText("20 000 FC")).toBeInTheDocument();
  });

  it("appelle onClick quand fourni, au clic et au clavier (Entrée)", () => {
    const onClick = jest.fn();
    render(
      <RoomCard
        numero="101"
        type="Standard"
        prix={45}
        devise={Devise.USD}
        statutTone="success"
        statutLabel="Libre"
        onClick={onClick}
      />
    );

    const carte = screen.getByRole("button");
    fireEvent.click(carte);
    fireEvent.keyDown(carte, { key: "Enter" });

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("n'est pas interactive quand onClick est absent (pas de role button)", () => {
    render(
      <RoomCard numero="101" type="Standard" prix={45} devise={Devise.USD} statutTone="success" statutLabel="Libre" />
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
