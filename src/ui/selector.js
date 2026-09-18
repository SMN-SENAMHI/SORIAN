import { el } from "./dom.js";
import { ICONS } from "./icons.js";
import { slidingMarker } from "./marker.js";

/** Grupo de opcion unica. Las variables llevan su pictograma. */
export function selectorGroup(label, options, selected, onChange, key = label) {
  const buttons = options.map((option) => {
    const icon = ICONS[option.id];
    return el("button", {
      class: `chip${option.id === selected ? " is-active" : ""}`,
      type: "button",
      "aria-pressed": String(option.id === selected),
      "aria-label": option.label,
      title: option.institution || option.label,
      onClick: () => onChange(option.id),
    }, [
      icon ? el("span", { class: "chip__glyph", html: icon }) : null,
      el("span", { class: "chip__label", "aria-hidden": "true", text: option.label }),
      option.short ? el("span", { class: "chip__short", "aria-hidden": "true", text: option.short }) : null,
    ]);
  });

  const track = el("div", { class: "selector__options" }, buttons);
  const moveTo = slidingMarker(track, key);
  const active = buttons[options.findIndex((option) => option.id === selected)];
  requestAnimationFrame(() => moveTo(active));

  return el("div", { class: "selector" }, [
    el("span", { class: "selector__label", text: label }),
    track,
  ]);
}
