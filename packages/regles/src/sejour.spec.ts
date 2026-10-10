import { acompteMaximal } from "./sejour";


describe("acompteMaximal", () => {
  it("vaut le prix du séjour", () => {
    expect(acompteMaximal(40, "2026-10-01T12:00:00Z", "2026-10-04T12:00:00Z")).toBe(120);
    expect(acompteMaximal(40, "2026-10-01T12:00:00Z", "2026-10-01T18:00:00Z")).toBe(40); // une nuit au minimum
  });
});
