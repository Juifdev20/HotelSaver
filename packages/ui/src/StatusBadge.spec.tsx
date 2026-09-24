import * as React from "react";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("affiche toujours le mot, jamais seulement la couleur", () => {
    render(<StatusBadge tone="success" label="Libre" />);
    expect(screen.getByText("Libre")).toBeInTheDocument();
  });

  it.each([
    ["success", "hc-status-badge--success"],
    ["warning", "hc-status-badge--warning"],
    ["danger", "hc-status-badge--danger"],
    ["info", "hc-status-badge--info"],
    ["neutral", "hc-status-badge--neutral"],
  ] as const)("applique la classe correspondant au ton %s", (tone, classeAttendue) => {
    render(<StatusBadge tone={tone} label="Test" />);
    expect(screen.getByText("Test").className).toContain(classeAttendue);
  });
});
