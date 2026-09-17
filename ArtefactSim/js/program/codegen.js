import { session } from "./session.js";

export function exprCode(node) {
  if (!node) return "0";
  const f = node.fields || {};
  const v = (k) => exprCode(node.values[k]);
  switch (node.kind) {
    case "number":
      return String(Number(f.VAL) || 0);
    case "string": {
      const s = String(f.VAL ?? "");
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) return s;
      return JSON.stringify(s);
    }
    case "get_var":
      return f.NAME || "n";
    case "op_math":
      return `(${v("A")} ${f.OP || "+"} ${v("B")})`;
    case "op_compare":
      return `(${v("A")} ${f.OP || ">"} ${v("B")})`;
    case "op_and":
      return `(${v("A")} and ${v("B")})`;
    case "op_or":
      return `(${v("A")} or ${v("B")})`;
    case "op_not":
      return `not (${v("A")})`;
    case "op_random":
      return `random(${v("A")}, ${v("B")})`;
    case "slot_x":
      return `slot_x(${v("I")})`;
    case "slot_y":
      return `slot_y(${v("I")})`;
    case "museum_x":
      return `museum_x(${v("C")})`;
    case "museum_y":
      return `museum_y(${v("C")})`;
    case "list_item":
      return `${f.NAME}[${v("I")}]`;
    case "list_len":
      return `len(${f.NAME})`;
    case "list_contains":
      return `(${v("VAL")} in ${f.NAME})`;
    case "list_make": {
      const items = ["A", "B", "C", "D"].map((k) => node.values[k] ? exprCode(node.values[k]) : null).filter(Boolean);
      return `list(${items.join(", ")})`;
    }
    default:
      return "0";
  }
}

export function stmtCode(node, indent) {
  const pad = "  ".repeat(indent);
  const v = (k) => exprCode(node.values[k]);
  const f = node.fields || {};
  const body = (k) => (node.stacks[k] || []).map((s) => stmtCode(s, indent + 1)).join("");
  switch (node.kind) {
    case "drive_to":
      return `${pad}drive_to(${v("X")}, ${v("Y")}, ${v("H")})\n`;
    case "go_straight":
      return `${pad}go_straight(${v("MM")}, ${v("POWER")})\n`;
    case "point_turn":
      return `${pad}point_turn(${v("H")})\n`;
    case "swing_turn":
      return `${pad}swing_turn(${v("H")}, ${f.MOTOR || "left"})\n`;
    case "pickup":
      return `${pad}pickup(${f.KIND || "arm"}, ${f.INDEX || 1})\n`;
    case "put_down":
      return `${pad}put_down(${f.KIND || "arm"}, ${f.INDEX || 1})\n`;
    case "repeat":
      return `${pad}for _ in range(${v("TIMES")}):\n${body("DO") || pad + "  pass\n"}`;
    case "forever":
      return `${pad}while True:\n${body("DO") || pad + "  pass\n"}`;
    case "if":
      return `${pad}if ${v("COND")}:\n${body("DO") || pad + "  pass\n"}`;
    case "if_else":
      return `${pad}if ${v("COND")}:\n${body("DO") || pad + "  pass\n"}${pad}else:\n${body("ELSE") || pad + "  pass\n"}`;
    case "while":
      return `${pad}while ${v("COND")}:\n${body("DO") || pad + "  pass\n"}`;
    case "set_var":
      return `${pad}${f.NAME} = ${v("VAL")}\n`;
    case "change_var":
      return `${pad}${f.NAME} = ${f.NAME} + ${v("VAL")}\n`;
    case "list_add":
      return `${pad}${f.NAME}.append(${v("VAL")})\n`;
    case "list_delete":
      return `${pad}del ${f.NAME}[${v("I")}]\n`;
    case "list_insert":
      return `${pad}${f.NAME}.insert(${v("I")}, ${v("VAL")})\n`;
    case "list_replace":
      return `${pad}${f.NAME}[${v("I")}] = ${v("VAL")}\n`;
    case "list_clear":
      return `${pad}${f.NAME}.clear()\n`;
    default:
      return "";
  }
}

export function generate() {
  const header = "# artefact program\n";
  return header + session.ws.script.map((s) => stmtCode(s, 0)).join("");
}
