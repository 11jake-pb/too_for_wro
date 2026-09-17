export const SPECS = {
  drive_to: {
    cat: "motion",
    shape: "stmt",
    parts: [
      "이동 ",
      { v: "X", shadow: "number", def: 0 },
      ", ",
      { v: "Y", shadow: "number", def: 0 },
      ", ",
      { v: "H", shadow: "number", def: 0 },
      "°",
    ],
  },
  go_straight: {
    cat: "motion",
    shape: "stmt",
    parts: ["앞으로 ", { v: "MM", shadow: "number", def: 200 }, " mm, 부호 ", { v: "POWER", shadow: "number", def: 1 }],
  },
  point_turn: {
    cat: "motion",
    shape: "stmt",
    parts: ["제자리 회전 ", { v: "H", shadow: "number", def: 0 }, "°"],
  },
  swing_turn: {
    cat: "motion",
    shape: "stmt",
    parts: [
      "스윙 회전 ",
      { v: "H", shadow: "number", def: 180 },
      "° 모터 ",
      { f: "MOTOR", options: [["왼쪽", "left"], ["오른쪽", "right"]], def: "left" },
    ],
  },
  pickup: {
    cat: "motion",
    shape: "stmt",
    parts: [
      "집기 ",
      { f: "KIND", options: [["집게 arm", "arm"], ["그리퍼 gripper", "gripper"]], def: "arm" },
      " ",
      { f: "INDEX", options: [["1번째", "1"], ["2번째", "2"], ["3번째", "3"], ["4번째", "4"]], def: "1" },
    ],
  },
  put_down: {
    cat: "motion",
    shape: "stmt",
    parts: [
      "놓기 ",
      { f: "KIND", options: [["집게 arm", "arm"], ["그리퍼 gripper", "gripper"]], def: "arm" },
      " ",
      { f: "INDEX", options: [["1번째", "1"], ["2번째", "2"], ["3번째", "3"], ["4번째", "4"]], def: "1" },
    ],
  },
  slot_x: {
    cat: "field",
    shape: "val",
    parts: ["슬롯 x(", { v: "I", shadow: "var", def: "i" }, ")"],
  },
  slot_y: {
    cat: "field",
    shape: "val",
    parts: ["슬롯 y(", { v: "I", shadow: "var", def: "i" }, ")"],
  },
  museum_x: {
    cat: "field",
    shape: "val",
    parts: ["박물관 x(", { v: "C", shadow: "var", def: "held" }, ")"],
  },
  museum_y: {
    cat: "field",
    shape: "val",
    parts: ["박물관 y(", { v: "C", shadow: "var", def: "held" }, ")"],
  },
  list_make: {
    cat: "lists",
    shape: "val",
    parts: [
      "list(",
      { v: "A", shadow: "string", def: "red" },
      ", ",
      { v: "B", shadow: "string", def: "green" },
      ", ",
      { v: "C", shadow: "string", def: "blue" },
      ", ",
      { v: "D", shadow: "string", def: "black" },
      ")",
    ],
  },
  repeat: {
    cat: "control",
    shape: "c",
    parts: ["반복 ", { v: "TIMES", shadow: "number", def: 3 }, " 번", { stack: "DO" }],
  },
  forever: { cat: "control", shape: "c", parts: ["계속 반복", { stack: "DO" }] },
  if: { cat: "control", shape: "c", parts: ["만약 ", { v: "COND" }, " 이면", { stack: "DO" }] },
  if_else: {
    cat: "control",
    shape: "c2",
    parts: ["만약 ", { v: "COND" }, " 이면", { stack: "DO" }, "아니면", { stack: "ELSE" }],
  },
  while: { cat: "control", shape: "c", parts: ["동안 ", { v: "COND" }, { stack: "DO" }] },
  number: { cat: "ops", shape: "val", parts: [{ f: "VAL", def: "0", wide: true }] },
  string: { cat: "ops", shape: "val", parts: [{ f: "VAL", def: "red", wide: true }] },
  op_math: {
    cat: "ops",
    shape: "val",
    parts: [
      { v: "A", shadow: "number", def: 1 },
      { f: "OP", options: [["+", "+"], ["-", "-"], ["×", "*"], ["÷", "/"], ["나머지", "%"]], def: "+" },
      { v: "B", shadow: "number", def: 1 },
    ],
  },
  op_compare: {
    cat: "ops",
    shape: "val",
    parts: [
      { v: "A", shadow: "number", def: 0 },
      { f: "OP", options: [["=", "=="], ["≠", "!="], ["<", "<"], [">", ">"], ["≤", "<="], ["≥", ">="]], def: ">" },
      { v: "B", shadow: "number", def: 0 },
    ],
  },
  op_and: { cat: "ops", shape: "val", parts: [{ v: "A" }, " 그리고 ", { v: "B" }] },
  op_or: { cat: "ops", shape: "val", parts: [{ v: "A" }, " 또는 ", { v: "B" }] },
  op_not: { cat: "ops", shape: "val", parts: ["아닌 ", { v: "A" }] },
  op_random: {
    cat: "ops",
    shape: "val",
    parts: ["난수 ", { v: "A", shadow: "number", def: 1 }, " ~ ", { v: "B", shadow: "number", def: 10 }],
  },
  set_var: {
    cat: "vars",
    shape: "stmt",
    parts: [{ f: "NAME", vars: true, def: "n" }, " = ", { v: "VAL", shadow: "number", def: 0 }],
  },
  change_var: {
    cat: "vars",
    shape: "stmt",
    parts: [{ f: "NAME", vars: true, def: "n" }, " 을(를) ", { v: "VAL", shadow: "number", def: 1 }, " 만큼 바꾸기"],
  },
  get_var: { cat: "vars", shape: "val", parts: [{ f: "NAME", vars: true, def: "held" }] },
  list_add: {
    cat: "lists",
    shape: "stmt",
    parts: [{ v: "VAL", shadow: "string", def: "red" }, " 을(를) ", { f: "NAME", lists: true, def: "colors" }, " 에 추가"],
  },
  list_delete: {
    cat: "lists",
    shape: "stmt",
    parts: [{ f: "NAME", lists: true, def: "colors" }, " 의 ", { v: "I", shadow: "number", def: 1 }, " 번째 삭제"],
  },
  list_insert: {
    cat: "lists",
    shape: "stmt",
    parts: [{ f: "NAME", lists: true, def: "colors" }, " 의 ", { v: "I", shadow: "number", def: 1 }, " 번째에 ", { v: "VAL", shadow: "string", def: "red" }],
  },
  list_replace: {
    cat: "lists",
    shape: "stmt",
    parts: [{ f: "NAME", lists: true, def: "colors" }, "[", { v: "I", shadow: "number", def: 1 }, "] = ", { v: "VAL", shadow: "string", def: "red" }],
  },
  list_clear: { cat: "lists", shape: "stmt", parts: [{ f: "NAME", lists: true, def: "colors" }, " 비우기"] },
  list_item: {
    cat: "lists",
    shape: "val",
    parts: [{ f: "NAME", lists: true, def: "colors" }, "[", { v: "I", shadow: "var", def: "i" }, "]"],
  },
  list_len: { cat: "lists", shape: "val", parts: ["길이 ", { f: "NAME", lists: true, def: "colors" }] },
  list_contains: {
    cat: "lists",
    shape: "val",
    parts: [{ f: "NAME", lists: true, def: "colors" }, " 에 ", { v: "VAL", shadow: "string", def: "red" }, " 있음"],
  },
};

export const PALETTE = [
  { cat: "motion", title: "로봇", kinds: ["go_straight", "point_turn", "swing_turn", "drive_to", "pickup", "put_down"] },
  { cat: "field", title: "아티팩트 배치", kinds: ["slot_x", "slot_y", "museum_x", "museum_y"] },
  { cat: "control", title: "제어", kinds: ["repeat", "forever", "if", "if_else", "while"] },
  { cat: "ops", title: "연산", kinds: ["number", "string", "op_math", "op_compare", "op_and", "op_or", "op_not", "op_random"] },
  { cat: "vars", title: "변수", kinds: ["set_var", "change_var", "get_var"] },
  { cat: "lists", title: "리스트", kinds: ["list_make", "list_add", "list_delete", "list_insert", "list_replace", "list_clear", "list_item", "list_len", "list_contains"] },
];

