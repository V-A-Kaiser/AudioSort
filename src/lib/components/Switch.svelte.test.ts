import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-svelte";
import Switch from "./Switch.svelte";

describe("Switch", () => {
  const options = ["Mean", "Peak", "RMS"] as const;

  it("renders one radio per option inside a labelled group", async () => {
    const screen = await render(Switch, {
      options,
      value: "Mean",
      label: "Measure"
    });

    await expect
      .element(screen.getByRole("radiogroup", { name: "Measure" }))
      .toBeInTheDocument();
    expect(screen.getByRole("radio").elements()).toHaveLength(3);
  });

  it("marks exactly the current option as checked", async () => {
    const screen = await render(Switch, {
      options,
      value: "Peak",
      label: "Measure"
    });

    await expect
      .element(screen.getByRole("radio", { name: "Peak" }))
      .toHaveAttribute("aria-checked", "true");
    expect(
      screen
        .getByRole("radio")
        .elements()
        .filter((radio) => radio.getAttribute("aria-checked") === "true")
    ).toHaveLength(1);
  });

  it("moves the check to a clicked option", async () => {
    const screen = await render(Switch, {
      options,
      value: "Mean",
      label: "Measure",
      size: "sm"
    });

    await screen.getByRole("radio", { name: "RMS" }).click();

    await expect
      .element(screen.getByRole("radio", { name: "RMS" }))
      .toHaveAttribute("aria-checked", "true");
    await expect
      .element(screen.getByRole("radio", { name: "Mean" }))
      .toHaveAttribute("aria-checked", "false");
  });
});
