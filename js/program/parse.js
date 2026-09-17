import { session } from "./session.js";
import { make, num, str, getVar } from "./ast.js";

export function tokenize(src) {
  const tokens = [];
  let i = 0;
  const isId = (c) => /[A-Za-z_]/.test(c);
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      tokens.push({ t: "nl" });
      i++;
      continue;
    }
    if (c === "#" ) {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      let s = "";
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") {
          s += src[i + 1] || "";
          i += 2;
          continue;
        }
        s += src[i++];
      }
      i++;
      tokens.push({ t: "str", v: s });
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
      let s = "";
      while (i < src.length && /[0-9.]/.test(src[i])) s += src[i++];
      tokens.push({ t: "num", v: s });
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["==", "!=", "<=", ">="].includes(two)) {
      tokens.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if ("+-*/%<>=()[].,:".includes(c)) {
      tokens.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (isId(c)) {
      let s = "";
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) s += src[i++];
      tokens.push({ t: "id", v: s });
      continue;
    }
    throw new Error("알 수 없는 글자: " + c);
  }
  tokens.push({ t: "eof" });
  return tokens;
}

export function parseExpr(src) {
  const tokens = tokenize(src);
  let p = 0;
  const peek = () => tokens[p];
  const eat = (v) => {
    const tok = tokens[p];
    if (v && !(tok.t === "op" && tok.v === v) && !(tok.t === "id" && tok.v === v)) {
      throw new Error("예상: " + v);
    }
    p++;
    return tok;
  };
  function atom() {
    const tok = peek();
    if (tok.t === "num") {
      eat();
      return num(tok.v);
    }
    if (tok.t === "str") {
      eat();
      return str(tok.v);
    }
    if (tok.t === "id") {
      eat();
      if (tok.v === "True" || tok.v === "False") {
        const n = make("op_compare");
        n.values.A = num(tok.v === "True" ? 1 : 0);
        n.fields.OP = "==";
        n.values.B = num(1);
        return n;
      }
      if (tok.v === "not") {
        const n = make("op_not");
        n.values.A = atom();
        return n;
      }
      if (tok.v === "slot_x" || tok.v === "slot_y") {
        eat("(");
        const n = make(tok.v);
        n.values.I = expr();
        eat(")");
        return n;
      }
      if (tok.v === "museum_x" || tok.v === "museum_y") {
        eat("(");
        const n = make(tok.v);
        n.values.C = expr();
        eat(")");
        return n;
      }
      if (tok.v === "random") {
        eat("(");
        const n = make("op_random");
        n.values.A = expr();
        eat(",");
        n.values.B = expr();
        eat(")");
        return n;
      }
      if (tok.v === "list") {
        eat("(");
        const n = make("list_make");
        const keys = ["A", "B", "C", "D"];
        keys.forEach((k) => {
          n.values[k] = null;
        });
        let i = 0;
        if (!(peek().t === "op" && peek().v === ")")) {
          while (i < keys.length) {
            n.values[keys[i]] = expr();
            i++;
            if (peek().t === "op" && peek().v === ",") {
              eat(",");
              continue;
            }
            break;
          }
        }
        eat(")");
        return n;
      }
      if (tok.v === "len") {
        eat("(");
        const name = eat().v;
        eat(")");
        const n = make("list_len");
        n.fields.NAME = name;
        if (!session.ws.lists.includes(name)) session.ws.lists.push(name);
        return n;
      }
      if (peek().t === "op" && peek().v === "[") {
        eat("[");
        const n = make("list_item");
        n.fields.NAME = tok.v;
        n.values.I = expr();
        eat("]");
        if (!session.ws.lists.includes(tok.v)) session.ws.lists.push(tok.v);
        return n;
      }
      if (session.ws.lists.includes(tok.v) || session.ws.vars.includes(tok.v)) return getVar(tok.v);
      return str(tok.v);
    }
    if (tok.t === "op" && tok.v === "(") {
      eat("(");
      const inner = expr();
      eat(")");
      return inner;
    }
    if (tok.t === "op" && (tok.v === "-" || tok.v === "+")) {
      eat();
      const inner = atom();
      if (tok.v === "+") return inner;
      if (inner.kind === "number") {
        inner.fields.VAL = String(-(Number(inner.fields.VAL) || 0));
        return inner;
      }
      const n = make("op_math");
      n.fields.OP = "-";
      n.values.A = num(0);
      n.values.B = inner;
      return n;
    }
    throw new Error("식을 읽을 수 없음");
  }
  function bin(next, ops, kind, field) {
    let left = next();
    while (peek().t === "op" && ops.includes(peek().v) || (peek().t === "id" && ops.includes(peek().v))) {
      const op = eat().v;
      const right = next();
      const n = make(kind);
      n.values.A = left;
      n.values.B = right;
      if (field) n.fields.OP = op === "×" ? "*" : op;
      left = n;
    }
    return left;
  }
  function mul() {
    return bin(atom, ["*", "/", "%"], "op_math", true);
  }
  function add() {
    return bin(mul, ["+", "-"], "op_math", true);
  }
  function cmp() {
    return bin(add, ["==", "!=", "<", ">", "<=", ">="], "op_compare", true);
  }
  function andExpr() {
    let left = cmp();
    while (peek().t === "id" && peek().v === "and") {
      eat();
      if (peek().t === "id" && peek().v === "in") {
        eat();
        const name = eat().v;
        const n = make("list_contains");
        n.fields.NAME = name;
        n.values.VAL = left;
        if (!session.ws.lists.includes(name)) session.ws.lists.push(name);
        left = n;
        continue;
      }
      const n = make("op_and");
      n.values.A = left;
      n.values.B = cmp();
      left = n;
    }
    if (peek().t === "id" && peek().v === "in") {
      eat();
      const name = eat().v;
      const n = make("list_contains");
      n.fields.NAME = name;
      n.values.VAL = left;
      if (!session.ws.lists.includes(name)) session.ws.lists.push(name);
      return n;
    }
    return left;
  }
  function orExpr() {
    return bin(andExpr, ["or"], "op_or", false);
  }
  function expr() {
    return orExpr();
  }
  const tree = expr();
  return tree;
}

export function parseProgram(text) {
  const raw = text.replace(/\t/g, "  ").replace(/\r/g, "").split("\n");
  const lines = raw.map((line, idx) => {
    const indent = line.match(/^ */)[0].length;
    return { n: idx + 1, indent, s: line.trim() };
  }).filter((l) => l.s && !l.s.startsWith("#"));
  let i = 0;
  function parseBlock(minIndent) {
    const out = [];
    while (i < lines.length && lines[i].indent >= minIndent) {
      if (lines[i].indent !== minIndent) throw new Error(lines[i].n + "행: 들여쓰기");
      if (lines[i].s === "else:") break;
      const st = parseStmt(minIndent);
      if (st) out.push(st);
    }
    return out;
  }
  function takeBody(indent) {
    if (i >= lines.length || lines[i].indent <= indent) return [];
    return parseBlock(lines[i].indent);
  }
  function parseStmt(indent) {
    const line = lines[i++];
    const s = line.s;
    const exprAt = (src) => {
      try {
        return parseExpr(src);
      } catch (err) {
        throw new Error(`${line.n}행: ${err.message}  [${src}]`);
      }
    };
    const call = s.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)\.?$/);
    if (s.endsWith(":") ) {
      const head = s.slice(0, -1);
      if (head.startsWith("for _ in range(") && head.endsWith(")")) {
        const inner = head.slice("for _ in range(".length, -1);
        const n = make("repeat");
        n.values.TIMES = exprAt(inner);
        n.stacks.DO = takeBody(indent);
        return n;
      }
      if (head === "while True") {
        const n = make("forever");
        n.stacks.DO = takeBody(indent);
        return n;
      }
      if (head.startsWith("while ")) {
        const n = make("while");
        n.values.COND = exprAt(head.slice(6));
        n.stacks.DO = takeBody(indent);
        return n;
      }
      if (head.startsWith("if ")) {
        const n = make("if");
        n.values.COND = exprAt(head.slice(3));
        n.stacks.DO = takeBody(indent);
        if (i < lines.length && lines[i].indent === indent && lines[i].s === "else:") {
          i++;
          const two = make("if_else");
          two.values.COND = n.values.COND;
          two.stacks.DO = n.stacks.DO;
          two.stacks.ELSE = takeBody(indent);
          return two;
        }
        return n;
      }
      throw new Error(line.n + "행: 알 수 없는 블록");
    }
    if (s.startsWith("del ")) {
      const m = s.match(/^del ([A-Za-z_][A-Za-z0-9_]*)\[(.*)\]$/);
      if (!m) throw new Error(line.n + "행: del");
      const n = make("list_delete");
      n.fields.NAME = m[1];
      n.values.I = exprAt(m[2]);
      if (!session.ws.lists.includes(m[1])) session.ws.lists.push(m[1]);
      return n;
    }
    const idxAssign = s.match(/^([A-Za-z_][A-Za-z0-9_]*)\[(.*)\] = (.*)$/);
    if (idxAssign) {
      const n = make("list_replace");
      n.fields.NAME = idxAssign[1];
      n.values.I = exprAt(idxAssign[2]);
      n.values.VAL = exprAt(idxAssign[3]);
      if (!session.ws.lists.includes(idxAssign[1])) session.ws.lists.push(idxAssign[1]);
      return n;
    }
    const method = s.match(/^([A-Za-z_][A-Za-z0-9_]*)\.(append|insert|clear)\((.*)\)$/);
    if (method) {
      const name = method[1];
      if (!session.ws.lists.includes(name)) session.ws.lists.push(name);
      if (method[2] === "clear") return Object.assign(make("list_clear"), { fields: { NAME: name } });
      if (method[2] === "append") {
        const n = make("list_add");
        n.fields.NAME = name;
        n.values.VAL = exprAt(method[3]);
        return n;
      }
      const args = splitArgs(method[3]);
      const n = make("list_insert");
      n.fields.NAME = name;
      n.values.I = exprAt(args[0]);
      n.values.VAL = exprAt(args[1] || "0");
      return n;
    }
    const assign = s.match(/^([A-Za-z_][A-Za-z0-9_]*) = (.*)$/);
    if (assign) {
      const rhs = assign[2];
      if (rhs.trim().startsWith("list(")) {
        if (!session.ws.lists.includes(assign[1])) session.ws.lists.push(assign[1]);
      } else if (!session.ws.vars.includes(assign[1])) session.ws.vars.push(assign[1]);
      const plus = rhs.startsWith(assign[1] + " + ");
      if (plus) {
        const n = make("change_var");
        n.fields.NAME = assign[1];
        n.values.VAL = exprAt(assign[2].slice(assign[1].length + 3));
        return n;
      }
      const n = make("set_var");
      n.fields.NAME = assign[1];
      n.values.VAL = exprAt(assign[2]);
      return n;
    }
    if (call) {
      const name = call[1];
      const args = splitArgs(call[2]);
      if (name === "drive_to") {
        const n = make("drive_to");
        n.values.X = exprAt(args[0] || "0");
        n.values.Y = exprAt(args[1] || "0");
        n.values.H = exprAt(args[2] || "0");
        return n;
      }
      if (name === "go_straight") {
        const n = make("go_straight");
        n.values.MM = exprAt(args[0] || "0");
        n.values.POWER = exprAt(args[1] || "1");
        return n;
      }
      if (name === "point_turn") {
        const n = make(name);
        n.values.H = exprAt(args[0] || "0");
        return n;
      }
      if (name === "swing_turn") {
        const n = make("swing_turn");
        n.values.H = exprAt(args[0] || "0");
        const mot = (args[1] || "left").replace(/['"]/g, "");
        n.fields.MOTOR = mot === "right" ? "right" : "left";
        return n;
      }
      if (name === "pickup" || name === "put_down") {
        const n = make(name);
        const kind = (args[0] || "arm").replace(/['"]/g, "");
        n.fields.KIND = kind === "gripper" ? "gripper" : "arm";
        n.fields.INDEX = String(clampIndex(args[1]));
        return n;
      }
    }
    if (!s.includes("(") && !s.includes("=") && !s.endsWith(":")) return null;
    throw new Error(line.n + "행: " + s);
  }
  const script = parseBlock(0);
  if (i < lines.length) throw new Error(lines[i].n + "행: 처리되지 않음");
  return script;
}

export function clampIndex(raw) {
  const n = Number(raw);
  if (n >= 1 && n <= 4) return n;
  return 1;
}

export function splitArgs(s) {
  const out = [];
  let d = 0;
  let cur = "";
  let q = "";
  for (const ch of s) {
    if (q) {
      cur += ch;
      if (ch === q) q = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      q = ch;
      cur += ch;
      continue;
    }
    if (ch === "(" || ch === "[") d++;
    if (ch === ")" || ch === "]") d--;
    if (ch === "," && d === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
