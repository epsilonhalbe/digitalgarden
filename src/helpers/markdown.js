import slugify from "slugify";
import markdownIt from "markdown-it";
import fs from "node:fs";
import matter from "gray-matter";
import jsYamlForMatter from "js-yaml";
import Image from "@11ty/eleventy-img";
import markdownItAnchor from "markdown-it-anchor";
import markdownItMark from "markdown-it-mark";
import markdownItFootnote from "markdown-it-footnote";
import markdownItMathjax3 from "markdown-it-mathjax3";
import markdownItAttrs from "markdown-it-attrs";
import markdownItTaskCheckbox from "markdown-it-task-checkbox";
import markdownItPlantuml from "markdown-it-plantuml";
import { headerToId, namedHeadingsFilter } from "./utils.js";
import { userMarkdownSetup } from "./userSetup.js";
import { basesPlugin } from "./basesPlugin.js";

// Obsidian writes [[Page\|Alias]] in frontmatter, but \| is an invalid YAML
// escape sequence. This custom engine strips \| before parsing. Shared between
// Eleventy's own frontmatter parser and the manual matter() call in
// getAnchorAttributes so that wikilink resolution can read the permalink.
export const matterOptions = {
  engines: {
    yaml: {
      parse: (str) => jsYamlForMatter.load(str.replace(/\\\|/g, "|")),
      stringify: (obj) => jsYamlForMatter.dump(obj),
    },
  },
};

export const tagRegex = /(^|\s|\>)(#[^\s!@#$%^&*()=+\.,\[{\]};:'"?><]+)(?!([^<]*>))/g;

export const isMarkdownPage = (inputPath) =>
  inputPath && /\.(md|markdown)$/i.test(inputPath);

export function getAnchorAttributes(filePath, linkTitle) {
  let fileName = filePath.replaceAll("&amp;", "&");
  let header = "";
  let headerLinkPath = "";
  if (fileName.includes("#")) {
    [fileName, header] = fileName.split("#");
    headerLinkPath = `#${headerToId(header)}`;
  }

  let noteIcon = process.env.NOTE_ICON_DEFAULT;
  const title = linkTitle ? linkTitle : fileName;
  let permalink = `/notes/${slugify(fileName)}`;
  let deadLink = false;
  try {
    const startPath = "./src/site/notes/";
    const fullPath = fileName.endsWith(".md") || fileName.endsWith(".canvas")
      ? `${startPath}${fileName}`
      : `${startPath}${fileName}.md`;
    const file = fs.readFileSync(fullPath, "utf8");
    const frontMatter = matter(file, matterOptions);
    if (frontMatter.data.permalink) {
      permalink = frontMatter.data.permalink;
    }
    if (frontMatter.data.tags && frontMatter.data.tags.indexOf("gardenEntry") != -1) {
      permalink = "/";
    }
    if (frontMatter.data.noteIcon) {
      noteIcon = frontMatter.data.noteIcon;
    }
  } catch {
    deadLink = true;
  }

  if (deadLink) {
    return {
      attributes: { "class": "internal-link is-unresolved", "href": "/404", "target": "" },
      innerHTML: title,
    };
  }
  return {
    attributes: {
      "class": "internal-link",
      "target": "",
      "data-note-icon": noteIcon,
      "href": `${permalink}${headerLinkPath}`,
    },
    innerHTML: title,
  };
}

export function getAnchorLink(filePath, linkTitle) {
  const { attributes, innerHTML } = getAnchorAttributes(filePath, linkTitle);
  return `<a ${Object.keys(attributes).map(key => `${key}="${attributes[key]}"`).join(" ")}>${innerHTML}</a>`;
}

export function transformImage(src, cls, alt, sizes, widths = ["500", "700", "auto"]) {
  const options = {
    widths,
    formats: ["webp", "jpeg"],
    outputDir: "./dist/img/optimized",
    urlPath: "/img/optimized",
  };
  Image(src, options);
  return Image.statsSync(src, options);
}

export function fillPictureSourceSets(src, cls, alt, meta, width, imageTag) {
  imageTag.tagName = "picture";
  let html = `<source
    media="(max-width:480px)"
    srcset="${meta.webp[0].url}"
    type="image/webp"
    />
    <source
    media="(max-width:480px)"
    srcset="${meta.jpeg[0].url}"
    />
    `;
  if (meta.webp && meta.webp[1] && meta.webp[1].url) {
    html += `<source
      media="(max-width:1920px)"
      srcset="${meta.webp[1].url}"
      type="image/webp"
      />`;
  }
  if (meta.jpeg && meta.jpeg[1] && meta.jpeg[1].url) {
    html += `<source
      media="(max-width:1920px)"
      srcset="${meta.jpeg[1].url}"
      />`;
  }
  html += `<img
    class="${cls.toString()}"
    src="${src}"
    alt="${alt}"
    width="${width}"
    />`;
  imageTag.innerHTML = html;
}

export const calloutMeta = /\[!([\w-]*)\|?(\s?.*)\](\+|\-){0,1}(\s?.*)/;

export function transformCalloutBlockquotes(blockquotes) {
  for (const blockquote of blockquotes) {
    transformCalloutBlockquotes(blockquote.querySelectorAll("blockquote"));

    let content = blockquote.innerHTML;
    let titleDiv = "";
    let calloutType = "";
    let calloutMetaData = "";
    let isCollapsable;
    let isCollapsed;
    if (!content.match(calloutMeta)) {
      continue;
    }

    content = content.replace(
      calloutMeta,
      function (metaInfoMatch, callout, metaData, collapse, title) {
        isCollapsable = Boolean(collapse);
        isCollapsed = collapse === "-";
        const titleText = title.replace(/(<\/{0,1}\w+>)/, "")
          ? title
          : `${callout.charAt(0).toUpperCase()}${callout.substring(1).toLowerCase()}`;
        const fold = isCollapsable
          ? `<div class="callout-fold"><i icon-name="chevron-down"></i></div>`
          : ``;
        calloutType = callout;
        calloutMetaData = metaData;
        titleDiv = `<div class="callout-title"><div class="callout-title-inner">${titleText}</div>${fold}</div>`;
        return "";
      }
    );

    /* Hacky fix for callouts with only a title */
    if (content === "\n<p>\n") {
      content = "";
    }
    const contentDiv = content ? `\n<div class="callout-content">${content}</div>` : "";

    blockquote.tagName = "div";
    blockquote.classList.add("callout");
    blockquote.classList.add(isCollapsable ? "is-collapsible" : "");
    blockquote.classList.add(isCollapsed ? "is-collapsed" : "");
    blockquote.setAttribute("data-callout", calloutType.toLowerCase());
    calloutMetaData && blockquote.setAttribute("data-callout-metadata", calloutMetaData);
    blockquote.innerHTML = `${titleDiv}${contentDiv}`;
  }
}

export function convertCanvasLinks(str) {
  return (
    str &&
    str.replace(/\[\[(.*?\|.*?)\]\]/g, function (match, p1) {
      if (p1.indexOf("],[") > -1 || p1.indexOf('"$"') > -1) {
        return match;
      }
      const [fileLink, linkTitle] = p1.split("|");
      return getAnchorLink(fileLink, linkTitle);
    })
  );
}

export function convertCanvasTags(str) {
  return (
    str &&
    str.replace(tagRegex, function (match, precede, tag) {
      return `${precede}<a class="tag" onclick="toggleTagSearch(this)" data-content="${tag}">${tag}</a>`;
    })
  );
}

export const markdownLib = markdownIt({ breaks: true, html: true, linkify: true })
  .use(markdownItAnchor, { slugify: headerToId })
  .use(markdownItMark)
  .use(markdownItFootnote)
  .use(function (md) {
    md.renderer.rules.hashtag_open = function (tokens, idx) {
      return '<a class="tag" onclick="toggleTagSearch(this)">';
    };
  })
  .use(markdownItMathjax3, {
    tex: { inlineMath: [["$", "$"]] },
    options: { skipHtmlTags: { "[-]": ["pre"] } },
  })
  .use(markdownItAttrs)
  .use(markdownItTaskCheckbox, {
    disabled: true,
    divWrap: false,
    divClass: "checkbox",
    idPrefix: "cbx_",
    ulClass: "task-list",
    liClass: "task-list-item",
  })
  .use(markdownItPlantuml, { openMarker: "```plantuml", closeMarker: "```" })
  .use(namedHeadingsFilter)
  .use(basesPlugin)
  .use(function (md) {
    //https://github.com/DCsunset/markdown-it-mermaid-plugin
    const origFenceRule =
      md.renderer.rules.fence ||
      function (tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options, env, self);
      };

    md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
      const token = tokens[idx];
      if (token.info === "mermaid") {
        return `<pre class="mermaid">${token.content.trim()}</pre>`;
      }
      if (token.info === "transclusion") {
        return `<div class="transclusion">${md.render(token.content.trim())}</div>`;
      }
      if (token.info === "gist") {
        return token.content.trim().split('\n')
          .filter(line => line.trim())
          .map(line => {
            line = line.trim();
            const [gistPath, filename = ''] = line.split('#');
            const gistUrl = `https://gist.github.com/${gistPath}.js`;
            const scriptUrl = filename ? `${gistUrl}?file=${encodeURIComponent(filename)}` : gistUrl;
            return `<script src="${scriptUrl}"></script>`;
          })
          .join('\n');
      }
      if (token.info.startsWith("ad-")) {
        const parts = token.content.trim().split("\n");
        let titleLine, collapse, icon, color;
        let collapsible = false;
        let collapsed = true;
        let nbLinesToSkip = 0;
        for (let i = 0; i < 4; i++) {
          if (parts[i] && parts[i].trim()) {
            const line = parts[i].trim().toLowerCase();
            if (line.startsWith("title:")) { titleLine = line.substring(6); nbLinesToSkip++; }
            else if (line.startsWith("icon:")) { icon = line.substring(5); nbLinesToSkip++; }
            else if (line.startsWith("collapse:")) {
              collapsible = true;
              collapse = line.substring(9);
              if (collapse && collapse.trim().toLowerCase() == 'open') collapsed = false;
              nbLinesToSkip++;
            }
            else if (line.startsWith("color:")) { color = line.substring(6); nbLinesToSkip++; }
          }
        }
        const foldDiv = collapsible ? `<div class="callout-fold">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-chevron-down">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
        </div>` : "";
        const titleDiv = titleLine
          ? `<div class="callout-title"><div class="callout-title-inner">${titleLine}</div>${foldDiv}</div>`
          : "";
        let collapseClasses = titleLine && collapsible ? 'is-collapsible' : '';
        if (collapsible && collapsed) collapseClasses += " is-collapsed";
        return `<div data-callout-metadata class="callout ${collapseClasses}" data-callout="${token.info.substring(3)}">${titleDiv}\n<div class="callout-content">${md.render(parts.slice(nbLinesToSkip).join("\n"))}</div></div>`;
      }
      return origFenceRule(tokens, idx, options, env, slf);
    };

    const defaultImageRule =
      md.renderer.rules.image ||
      function (tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options, env, self);
      };
    md.renderer.rules.image = (tokens, idx, options, env, self) => {
      const imageName = tokens[idx].content;
      const [fileName, ...widthAndMetaData] = imageName.split("|");
      const lastValue = widthAndMetaData[widthAndMetaData.length - 1];
      const lastValueIsNumber = !isNaN(lastValue);
      const width = lastValueIsNumber ? lastValue : null;
      if (width) {
        const widthIndex = tokens[idx].attrIndex("width");
        const widthAttr = `${width}px`;
        if (widthIndex < 0) {
          tokens[idx].attrPush(["width", widthAttr]);
        } else {
          tokens[idx].attrs[widthIndex][1] = widthAttr;
        }
      }
      return defaultImageRule(tokens, idx, options, env, self);
    };

    const defaultLinkRule =
      md.renderer.rules.link_open ||
      function (tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options, env, self);
      };
    function isExternalHref(href) {
      if (!href) return false;
      const trimmed = href.trim();
      if (
        trimmed.startsWith("/") ||
        trimmed.startsWith("#") ||
        trimmed.startsWith("?") ||
        trimmed.startsWith("./") ||
        trimmed.startsWith("../")
      ) {
        return false;
      }
      return /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
    }
    md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
      const hrefIndex = tokens[idx].attrIndex("href");
      const href =
        hrefIndex >= 0 && tokens[idx].attrs && tokens[idx].attrs[hrefIndex]
          ? tokens[idx].attrs[hrefIndex][1]
          : "";
      const isExternal = isExternalHref(href);
      if (isExternal) {
        const aIndex = tokens[idx].attrIndex("target");
        const classIndex = tokens[idx].attrIndex("class");
        if (aIndex < 0) tokens[idx].attrPush(["target", "_blank"]);
        else tokens[idx].attrs[aIndex][1] = "_blank";
        if (classIndex < 0) tokens[idx].attrPush(["class", "external-link"]);
        else if (!tokens[idx].attrs[classIndex][1].includes("external-link"))
          tokens[idx].attrs[classIndex][1] += " external-link";
      } else {
        const classIndex = tokens[idx].attrIndex("class");
        if (classIndex < 0) tokens[idx].attrPush(["class", "internal-link"]);
        else if (!tokens[idx].attrs[classIndex][1].includes("internal-link"))
          tokens[idx].attrs[classIndex][1] += " internal-link";
      }
      return defaultLinkRule(tokens, idx, options, env, self);
    };
  })
  .use(userMarkdownSetup);
