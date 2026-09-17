import { session } from "./session.js";
import { SPECS } from "./specs.js";

export function uid() {
  return "b" + session.nid++;
}

export function num(n) {
  return { id: uid(), kind: "number", fields: { VAL: String(n) }, values: {}, stacks: {} };
}

export function str(s) {
  return { id: uid(), kind: "string", fields: { VAL: s }, values: {}, stacks: {} };
}

export function getVar(name) {
  return { id: uid(), kind: "get_var", fields: { NAME: name }, values: {}, stacks: {} };
}

export function clone(node) {
  if (!node) return null;
  return {
    id: uid(),
    kind: node.kind,
    fields: { ...node.fields },
    values: Object.fromEntries(Object.entries(node.values || {}).map(([k, v]) => [k, clone(v)])),
    stacks: Object.fromEntries(Object.entries(node.stacks || {}).map(([k, arr]) => [k, (arr || []).map(clone)])),
  };
}

export function make(kind, extra = {}) {
  const node = { id: uid(), kind, fields: {}, values: {}, stacks: {}, ...extra };
  node.fields = { ...node.fields };
  node.values = { ...node.values };
  node.stacks = { ...node.stacks };
  const spec = SPECS[kind];
  if (!spec) return node;
  for (const part of spec.parts) {
    if (part.v && part.shadow === "number" && !node.values[part.v]) node.values[part.v] = num(part.def ?? 0);
    if (part.v && part.shadow === "string" && !node.values[part.v]) node.values[part.v] = str(part.def ?? "");
    if (part.v && part.shadow === "var" && !node.values[part.v]) {
      const name = part.def || session.ws.vars[0] || "n";
      if (!session.ws.vars.includes(name)) session.ws.vars.push(name);
      node.values[part.v] = getVar(name);
    }
    if (part.f && node.fields[part.f] == null) node.fields[part.f] = part.def ?? (part.options ? part.options[0][1] : "");
    if (part.stack && !node.stacks[part.stack]) node.stacks[part.stack] = [];
  }
  return node;
}
export function isValue(kind) {
  return SPECS[kind]?.shape === "val";
}

export function take(id) {
  function fromList(arr) {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].id === id) return arr.splice(i, 1)[0];
      const got = fromNode(arr[i]);
      if (got) return got;
    }
    return null;
  }
  function fromNode(n) {
    for (const k of Object.keys(n.values || {})) {
      const ch = n.values[k];
      if (!ch) continue;
      if (ch.id === id) {
        n.values[k] = null;
        return ch;
      }
      const got = fromNode(ch);
      if (got) return got;
    }
    for (const k of Object.keys(n.stacks || {})) {
      const got = fromList(n.stacks[k]);
      if (got) return got;
    }
    return null;
  }
  return fromList(session.ws.script);
}
