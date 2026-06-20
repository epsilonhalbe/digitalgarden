import matter from "gray-matter";
import { parse } from "node-html-parser";
import htmlMinifier from "html-minifier-terser";
import pluginRss from "@11ty/eleventy-plugin-rss";
import faviconsPlugin from "eleventy-plugin-gen-favicons";
import tocPlugin from "eleventy-plugin-nesting-toc";
import normalizeFavicon from "./src/site/normalize-favicon.js";
import { userEleventySetup } from "./src/helpers/userSetup.js";
import {
  matterOptions,
  tagRegex,
  isMarkdownPage,
  getAnchorAttributes,
  getAnchorLink,
  transformImage,
  fillPictureSourceSets,
  transformCalloutBlockquotes,
  convertCanvasLinks,
  convertCanvasTags,
  markdownLib,
} from "./src/helpers/markdown.js";

const FAVICON_SOURCE = "./src/site/favicon.svg";
const FAVICON_NORMALIZED = "./.cache/favicon.normalized.svg";
normalizeFavicon(FAVICON_SOURCE, FAVICON_NORMALIZED);

export default function (eleventyConfig) {
  eleventyConfig.setLiquidOptions({ dynamicPartials: true });
  eleventyConfig.setFrontMatterParsingOptions(matterOptions);
  eleventyConfig.setLibrary("md", markdownLib);

  // --- Filters ---

  eleventyConfig.addFilter("isoDate", (date) => date && date.toISOString());

  eleventyConfig.addFilter("link", function (str) {
    return (
      str &&
      str.replace(/\[\[(.*?\|.*?)\]\]/g, function (match, p1) {
        //Check if it is an embedded excalidraw drawing or mathjax javascript
        if (p1.indexOf("],[") > -1 || p1.indexOf('"$"') > -1) {
          return match;
        }
        const [fileLink, linkTitle] = p1.split("|");
        return getAnchorLink(fileLink, linkTitle);
      })
    );
  });

  eleventyConfig.addFilter(
    "taggify",
    (str) =>
      str &&
      str.replace(
        tagRegex,
        (match, precede, tag) =>
          `${precede}<a class="tag" onclick="toggleTagSearch(this)" data-content="${tag}">${tag}</a>`,
      ),
  );

  eleventyConfig.addFilter("stripForSearch", (content) =>
    content
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );

  eleventyConfig.addFilter("searchableTags", function (str) {
    const match = str && str.match(tagRegex);
    if (!match) return "";
    const tags = match.map((m) => `"${m.split("#")[1]}"`).join(", ");
    return tags ? `${tags},` : "";
  });

  eleventyConfig.addFilter(
    "hideDataview",
    (str) => str && str.replace(/\(\S+\:\:(.*)\)/g, (_, value) => value.trim()),
  );

  eleventyConfig.addFilter("xmlSafe", function (str) {
    if (!str) return str;
    // Remove invalid XML characters (0xFFFE, 0xFFFF, etc.)
    str = str.replace(/￾|￿/g, "");
    str = str.replace(/\]\]>/g, "]]&gt;");
    str = str.replace(/<br\s*>/gi, "<br />");
    str = str.replace(/<hr\s*>/gi, "<hr />");
    str = str.replace(/<link([^>]*?)(?<!\/)>/gi, "<link$1 />");
    str = str.replace(/<img([^>]*?)(?<!\/)>/gi, "<img$1 />");
    return str;
  });

  eleventyConfig.addFilter("dateToZulu", function (date) {
    try {
      return new Date(date).toISOString("dd-MM-yyyyTHH:mm:ssZ");
    } catch {
      return "";
    }
  });

  eleventyConfig.addFilter(
    "jsonify",
    (variable) => JSON.stringify(variable) || '""',
  );

  eleventyConfig.addFilter("validJson", function (variable) {
    if (Array.isArray(variable)) {
      return variable.map((x) => x.replaceAll("\\", "\\\\")).join(",");
    } else if (typeof variable === "string") {
      return variable.replaceAll("\\", "\\\\");
    }
    return variable;
  });

  // --- Transforms ---

  eleventyConfig.addTransform("dataview-js-links", function (str) {
    if (!isMarkdownPage(this.page.inputPath)) return str;
    const parsed = parse(str);
    for (const dataViewJsLink of parsed.querySelectorAll(
      "a[data-href].internal-link",
    )) {
      const notePath = dataViewJsLink.getAttribute("data-href");
      const title = dataViewJsLink.innerHTML;
      const { attributes, innerHTML } = getAnchorAttributes(notePath, title);
      for (const key in attributes) {
        dataViewJsLink.setAttribute(key, attributes[key]);
      }
      dataViewJsLink.innerHTML = innerHTML;
    }
    return str && parsed.innerHTML;
  });

  eleventyConfig.addTransform("callout-block", function (str) {
    if (!isMarkdownPage(this.page.inputPath)) return str;
    const parsed = parse(str);
    transformCalloutBlockquotes(parsed.querySelectorAll("blockquote"));
    return str && parsed.innerHTML;
  });

  eleventyConfig.addTransform("picture", function (str) {
    if (!isMarkdownPage(this.page.inputPath)) return str;
    if (process.env.USE_FULL_RESOLUTION_IMAGES === "true") return str;
    const parsed = parse(str);
    for (const imageTag of parsed.querySelectorAll(".cm-s-obsidian img")) {
      const src = imageTag.getAttribute("src");
      if (src && src.startsWith("/") && !src.endsWith(".svg")) {
        const cls = imageTag.classList.value;
        const alt = imageTag.getAttribute("alt");
        const width = imageTag.getAttribute("width") || "";
        try {
          const meta = transformImage(
            "./src/site" + decodeURI(imageTag.getAttribute("src")),
            cls.toString(),
            alt,
            ["(max-width: 480px)", "(max-width: 1024px)"],
          );
          if (meta) fillPictureSourceSets(src, cls, alt, meta, width, imageTag);
        } catch {
          // Make it fault tolerant.
        }
      }
    }
    return str && parsed.innerHTML;
  });

  eleventyConfig.addTransform("table", function (str) {
    if (!isMarkdownPage(this.page.inputPath)) return str;
    const parsed = parse(str);
    for (const t of parsed.querySelectorAll(".cm-s-obsidian > table")) {
      const inner = t.innerHTML;
      t.tagName = "div";
      t.classList.add("table-wrapper");
      t.innerHTML = `<table>${inner}</table>`;
    }
    for (const t of parsed.querySelectorAll(
      ".cm-s-obsidian > .block-language-dataview > table",
    )) {
      t.classList.add("dataview");
      t.classList.add("table-view-table");
      t.querySelector("thead")?.classList.add("table-view-thead");
      t.querySelector("tbody")?.classList.add("table-view-tbody");
      t.querySelectorAll("thead > tr")?.forEach((tr) =>
        tr.classList.add("table-view-tr-header"),
      );
      t.querySelectorAll("thead > tr > th")?.forEach((th) =>
        th.classList.add("table-view-th"),
      );
    }
    return str && parsed.innerHTML;
  });

  eleventyConfig.addTransform("canvas-markdown", function (str) {
    if (!str || !str.includes('data-markdown="')) return str;
    try {
      const parsed = parse(str);
      for (const textNode of parsed.querySelectorAll(
        ".canvas-node-text-content[data-markdown]",
      )) {
        const base64Content = textNode.getAttribute("data-markdown");
        if (base64Content) {
          try {
            const markdown = Buffer.from(base64Content, "base64").toString(
              "utf8",
            );
            let rendered = markdownLib.render(markdown);
            rendered = convertCanvasLinks(rendered);
            rendered = convertCanvasTags(rendered);
            const renderedParsed = parse(rendered);
            transformCalloutBlockquotes(
              renderedParsed.querySelectorAll("blockquote"),
            );
            textNode.innerHTML = renderedParsed.innerHTML;
            textNode.removeAttribute("data-markdown");
          } catch (e) {
            console.error("Failed to render canvas markdown:", e);
            const rawText = Buffer.from(base64Content, "base64").toString(
              "utf8",
            );
            textNode.innerHTML = `<pre>${rawText}</pre>`;
            textNode.removeAttribute("data-markdown");
          }
        }
      }
      return parsed.innerHTML;
    } catch (e) {
      console.error("Failed to parse canvas content:", e);
      return str;
    }
  });

  eleventyConfig.addTransform("htmlMinifier", async function (content) {
    if (
      (process.env.NODE_ENV === "production" ||
        process.env.ELEVENTY_ENV === "prod") &&
      (this.page.outputPath || "").endsWith(".html")
    ) {
      try {
        return await htmlMinifier.minify(content, {
          useShortDoctype: true,
          removeComments: true,
          collapseWhitespace: true,
          conservativeCollapse: true,
          preserveLineBreaks: true,
          minifyCSS: true,
          minifyJS: true,
          keepClosingSlash: true,
        });
      } catch {
        return content;
      }
    }
    return content;
  });

  eleventyConfig.addTransform("jsonMinifier", async (content, outputPath) => {
    if (
      (process.env.NODE_ENV === "production" ||
        process.env.ELEVENTY_ENV === "prod") &&
      outputPath &&
      outputPath.endsWith(".json")
    ) {
      try {
        return JSON.stringify(JSON.parse(content));
      } catch {
        return content;
      }
    }
    return content;
  });

  // --- Passthrough, plugins, extensions ---

  eleventyConfig.addPassthroughCopy("src/site/img");
  eleventyConfig.addPassthroughCopy("src/site/scripts");
  eleventyConfig.addPassthroughCopy("src/site/styles/_theme.*.css");
  eleventyConfig.addPassthroughCopy({ "src/site/logo.*": "/" });
  eleventyConfig.on("eleventy.before", () =>
    normalizeFavicon(FAVICON_SOURCE, FAVICON_NORMALIZED),
  );
  eleventyConfig.addWatchTarget(FAVICON_SOURCE);
  eleventyConfig.addPlugin(faviconsPlugin, { outputDir: "dist" });
  eleventyConfig.addPlugin(tocPlugin, {
    ul: true,
    tags: ["h1", "h2", "h3", "h4", "h5", "h6"],
  });

  // Canvas files are pre-compiled HTML by the plugin - don't process as markdown
  eleventyConfig.addExtension("canvas", {
    read: true,
    compile: async function (inputContent, _inputPath) {
      const parsed = matter(inputContent, matterOptions);
      return async (_data) => parsed.content;
    },
  });

  eleventyConfig.addPlugin(pluginRss, {
    posthtmlRenderOptions: {
      closingSingleTag: "slash",
      singleTags: ["link"],
    },
  });

  userEleventySetup(eleventyConfig);

  return {
    dir: {
      input: "src/site",
      output: "dist",
      data: `_data`,
    },
    templateFormats: ["njk", "md", "11ty.js", "canvas"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: false,
    passthroughFileCopy: true,
  };
}
