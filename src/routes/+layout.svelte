<script lang="ts">
  import "./layout.css";

  let { children } = $props();

  const url = "https://audiosort.vakaiser.com/";
  const title = "AudioSort | Concatenative Audio Sorting";
  const description =
    "Concatenative audio synthesis through monotonic sorting. Slice an audio file into chunks and sort them to create new sonic textures.";
  const image = `${url}og.png`;

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "AudioSort",
    url,
    description,
    image,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript and the Web Audio API.",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: { "@type": "Person", name: "Valerie Kaiser" }
  });
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={url} />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta name="theme-color" content="#171717" />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="AudioSort" />
  <meta property="og:url" content={url} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={image} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="The AudioSort interface" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={image} />

  <!-- eslint-disable-next-line svelte/no-at-html-tags, no-useless-escape -->
  {@html `<script type="application/ld+json">${jsonLd}<\/script>`}
</svelte:head>
<div class="min-h-dvh bg-neutral-900 text-neutral-100">
  {@render children()}
</div>
