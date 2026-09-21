import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import Title from "./Title.svelte";

describe("Title", () => {
  afterEach(() => vi.restoreAllMocks());

  it("labels the heading and hides each letter from assistive tech", async () => {
    const screen = await render(Title, { name: "AudioSort" });

    await expect
      .element(screen.getByRole("heading", { name: "AudioSort" }))
      .toBeInTheDocument();
    expect(
      screen.container.querySelectorAll("h1 > span[aria-hidden=true]")
    ).toHaveLength(9);
  });

  it("leaves every letter in place under reduced motion", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true
    } as MediaQueryList);

    const screen = await render(Title, { name: "AudioSort" });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const transforms = [
      ...screen.container.querySelectorAll<HTMLElement>("h1 > span")
    ].map((letter) => letter.style.transform);
    expect(new Set(transforms)).toEqual(new Set(["translateX(0px)"]));
  });
});
