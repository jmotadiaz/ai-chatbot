import { chromium } from "@playwright/test";

/**
 * Mobile-first acceptance check for published artifacts.
 *
 * Reports the agent generates (architecture reviews, canvases, lessons) are
 * read on a phone as often as on a desktop, and the failure is invisible from
 * the source: a Tailwind class without a breakpoint prefix (`grid-cols-3`)
 * looks fine at 1440px and produces a sideways-scrolling page at 390px. This
 * script is the check the `mobile-first-artifacts` skill tells the agent to
 * run before it hands over a URL.
 *
 * Lives here rather than in `coding-agent` because this is the package that
 * owns Playwright and its browser cache.
 *
 * Usage: pnpm --filter chatbot check:mobile <url> [url...]
 * Exit code: 1 if any artifact overflows horizontally or renders sub-12px text.
 */

const VIEWPORTS = [
  { label: "iPhone SE / Android pequeño", width: 320, height: 700 },
  { label: "iPhone 14", width: 390, height: 844 },
];

/** Below this, a text node is unreadable on a phone; badges excepted at 12px. */
const MIN_READABLE_PX = 12;

interface Measurement {
  overflowPx: number;
  offenders: Array<{ tag: string; cls: string; width: number }>;
  tinyTextNodes: number;
  smallestPx: number | null;
}

async function measure(url: string): Promise<Measurement[]> {
  const browser = await chromium.launch();
  const results: Measurement[] = [];
  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.goto(url, { waitUntil: "networkidle" });
      // Mermaid renders its diagrams after load; measure the settled page.
      await page.waitForTimeout(1200);
      results.push(
        await page.evaluate((minPx: number) => {
          const doc = document.documentElement;
          const width = doc.clientWidth;
          const offenders = [...document.querySelectorAll("body *")]
            .filter((el) => el.getBoundingClientRect().width > width + 1)
            .map((el) => ({
              tag: el.tagName.toLowerCase(),
              cls: String(el.getAttribute("class") ?? "").slice(0, 60),
              width: Math.round(el.getBoundingClientRect().width),
            }))
            .sort((a, b) => b.width - a.width)
            .slice(0, 3);
          const leaves = [...document.querySelectorAll("body *")].filter(
            (el) => el.children.length === 0 && el.textContent?.trim(),
          );
          const sizes = leaves.map((el) => parseFloat(getComputedStyle(el).fontSize));
          const tiny = sizes.filter((s) => s < minPx).length;
          return {
            overflowPx: Math.max(0, doc.scrollWidth - width),
            offenders,
            tinyTextNodes: tiny,
            smallestPx: sizes.length ? Math.round(Math.min(...sizes) * 10) / 10 : null,
          };
        }, MIN_READABLE_PX),
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return results;
}

function describe(url: string, measurements: Measurement[]): boolean {
  let ok = true;
  console.log(`\n${url}`);
  measurements.forEach((m, i) => {
    const viewport = VIEWPORTS[i]!;
    const readable = m.tinyTextNodes === 0;
    const fits = m.overflowPx === 0;
    if (!fits || !readable) ok = false;
    console.log(
      `  ${viewport.width}px (${viewport.label}): ${fits ? "cabe" : `desborda ${m.overflowPx}px`} · ` +
        `${m.tinyTextNodes} nodos de texto < ${MIN_READABLE_PX}px${m.smallestPx ? ` (mín ${m.smallestPx}px)` : ""}`,
    );
    for (const offender of m.offenders) {
      console.log(`      ↳ <${offender.tag} class="${offender.cls}"> mide ${offender.width}px`);
    }
  });
  return ok;
}

async function main(): Promise<boolean> {
  const urls = process.argv.slice(2);
  if (urls.length === 0) {
    console.error("Usage: pnpm --filter chatbot check:mobile <url> [url...]");
    return true;
  }
  let allOk = true;
  for (const url of urls) allOk = describe(url, await measure(url)) && allOk;
  console.log(
    allOk
      ? "\nMobile-first OK"
      : "\nMobile-first FAIL: arregla el HTML (ver el skill `mobile-first-artifacts`) y vuelve a publicar.",
  );
  return allOk;
}

main()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
