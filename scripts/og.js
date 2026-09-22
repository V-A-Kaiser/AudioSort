import { chromium } from "playwright";
import { preview } from "vite";

const server = await preview({ preview: { port: 4173, strictPort: true } });
const browser = await chromium.launch();

try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 1300 },
    deviceScaleFactor: 2
  });
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.setInputFiles('input[type="file"]', "fixtures/Hellthrasher.mp3");
  await page.waitForTimeout(6000);

  const sections = await page.$$("main > *");
  const ink = await sections[0].evaluate((title) => {
    title.style.fontSize = "216px";
    const style = getComputedStyle(title);
    const context = document.createElement("canvas").getContext("2d");
    context.font = style.font;
    const metrics = context.measureText(title.ariaLabel);
    const baseline =
      (parseFloat(style.lineHeight) +
        metrics.fontBoundingBoxAscent -
        metrics.fontBoundingBoxDescent) /
      2;
    return {
      top: baseline - metrics.actualBoundingBoxAscent,
      height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
    };
  });
  const box = await sections[0].boundingBox();
  const title = (
    await page.screenshot({
      clip: {
        x: box.x,
        y: box.y + ink.top - 2,
        width: box.width,
        height: ink.height + 4
      }
    })
  ).toString("base64");
  const panels = await Promise.all(
    [2, 3, 4].map(async (index) =>
      (await sections[index].screenshot()).toString("base64")
    )
  );

  const card = await browser.newPage({
    viewport: { width: 1920, height: 1008 },
    deviceScaleFactor: 0.625
  });
  await card.setContent(`
    <body style="margin:0;height:100vh;background:#171717;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:48px">
      <img src="data:image/png;base64,${title}" style="width:${box.width}px">
      <div style="display:flex;align-items:center;gap:48px">
        ${panels.map((panel) => `<img src="data:image/png;base64,${panel}" style="width:576px">`).join("")}
      </div>
    </body>
  `);
  await card.evaluate(() => {
    const [title, , controls] = document.images;
    const offset =
      (controls.getBoundingClientRect().top - title.height) / 2 -
      title.getBoundingClientRect().top;
    title.style.transform = `translateY(${offset}px)`;
  });
  await card.screenshot({ path: "static/og.png" });
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
