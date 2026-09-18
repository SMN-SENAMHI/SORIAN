export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== null && value !== false) node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child) node.append(child);
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

export function spinner(message = "Cargando…") {
  return el("div", { class: "spinner", role: "status" }, [
    el("div", { class: "spinner__ring", "aria-hidden": "true" }),
    el("p", { text: message }),
  ]);
}

export function errorBox(message, retry) {
  return el("div", { class: "error-box", role: "alert" }, [
    el("p", { text: message }),
    retry ? el("button", { class: "btn", text: "Reintentar", onClick: retry }) : null,
  ]);
}
