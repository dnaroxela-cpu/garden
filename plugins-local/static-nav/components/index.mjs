import { h } from "preact"
import { resolveRelative } from "@quartz-community/utils"

const defaultOptions = {
  links: [],
}

export const StaticNav = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }

  const StaticNavComponent = ({ fileData, displayClass }) => {
    if (opts.links.length === 0) return null

    return h(
      "div",
      { class: ["static-nav", displayClass].filter(Boolean).join(" ") },
      h(
        "ul",
        { class: "static-nav-list" },
        opts.links.map((link) =>
          h(
            "li",
            { class: "static-nav-item" },
            link.external
              ? h("a", { href: link.slug, target: "_blank", rel: "noopener noreferrer" }, link.title)
              : h("a", { href: resolveRelative(fileData.slug, link.slug) }, link.title),
          ),
        ),
      ),
    )
  }

  StaticNavComponent.displayName = "StaticNav"
  return StaticNavComponent
}

export default StaticNav
