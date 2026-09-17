import {
  ART_H, ART_W, CORRIDOR_X, GRAB_PAD, MAT, MIN_GAP, MUSEUM, WHEEL_H, WHEEL_T, fieldSlotAt,
} from "./constants.js";
import { state } from "./state.js";
import { moduleAabb, robotBounds, sizeOf, toolCenterLocal, toolPart, wrapHeading } from "./geom.js";
import { toolIndex } from "./field.js";

export function buildAiPrompt() {
  const goal = (document.getElementById("ai-goal")?.value || "").trim() || "(사용자가 아직 목표를 적지 않음. 물어보고 프로그램을 제안할 것.)";
  const bounds = robotBounds();
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const arms = [];
  const grips = [];
  state.parts.forEach((p) => {
    const row = {
      index: toolIndex(p),
      kind: p.kind === "clamp" ? "arm" : "gripper",
      hangar: p.kind,
      face: p.face,
      x: p.x,
      y: p.y,
      w: sizeOf(p).w,
      d: sizeOf(p).d,
    };
    if (p.kind === "clamp") arms.push(row);
    else grips.push(row);
  });
  const fmtTool = (t) => {
    const hangar = t.kind === "gripper" ? "gripper" : "clamp";
    const part = state.parts.filter((p) => p.kind === hangar)[t.index - 1];
    if (!part) return `- ${t.kind} #${t.index}`;
    const b = moduleAabb(part);
    const c = toolCenterLocal(part);
    return `- ${t.kind} #${t.index} face=${t.face} AABB local x[${b.minX.toFixed(0)},${b.maxX.toFixed(0)}] y[${b.minY.toFixed(0)},${b.maxY.toFixed(0)}] GRAB CENTER=(${c.x.toFixed(1)}, ${c.y.toFixed(1)}). heading0 robot=(Ax+${c.x.toFixed(1)}, Ay-${c.y.toFixed(1)}, 0). heading180 robot=(Ax-${c.x.toFixed(1)}, Ay+${c.y.toFixed(1)}, 180).`;
  };
  const code = window.Program?.getCode?.() || "# (no program yet)\n";
  const arm1 = toolPart("arm", 1);
  const cArm = arm1 ? toolCenterLocal(arm1) : { x: 0, y: 90 };
  const routes = state.slots
    .map((color, i) => {
      const home = fieldSlotAt(i);
      const live = state.arts[i] || home;
      const mu = MUSEUM[color];
      const from = state.keepArts ? { x: live.x, y: live.y } : home;
      const pick = `(${(from.x + cArm.x).toFixed(1)}, ${(from.y - cArm.y).toFixed(1)}, 0°)`;
      const drop = mu
        ? `(${(mu.x - cArm.x).toFixed(1)}, ${(mu.y + cArm.y).toFixed(1)}, 180°)`
        : "?";
      const dest = mu ? `(${mu.x}, ${mu.y})` : "?";
      return `  ${color}: home=(${home.x}, ${home.y}) live=(${live.x.toFixed(1)}, ${live.y.toFixed(1)}) museum=${dest} | arm#1 pickup pose from ${state.keepArts ? "LIVE" : "HOME"} ${pick} | put_down pose ${drop}`;
    })
    .join("\n");
  const startRule = state.keepArts
    ? `1. Pressing "프로그램 시작" teleports the robot to START POSE but KEEPS artefact LIVE positions (실험 배치). held flags are cleared. Plan pickup from LIVE coords below, not HOME, unless the user says otherwise.`
    : `1. Pressing "프로그램 시작" ALWAYS teleports the robot to START POSE and ALWAYS resets every artefact to its HOME excavation slot below. held/STRUCK/live positions are discarded. Plan ONLY from START POSE + HOME slots.`;
  return `You are helping write or debug a program for Artefact Sim, a kinematic simulator for WRO 2026 RoboMission Junior (Heritage Heroes).

Reply with runnable code in THIS simulator's language (not Pybricks/MicroPython, not LEGO SPIKE Python). Do not invent extra motion APIs.

# User request
${goal}

# MUST assume — this is ground truth, not optional
${startRule}
2. Museum destinations ARE the MUSEUM coordinates in this prompt. They are part of the simulator. Use them. Do not say they are unknown.
3. Pickup is NOT "near the mount". Put the tool GRAB CENTER on the artefact center.
4. After put_down, drive straight until the chassis/wheels/tools no longer overlap that artefact, then you may rotate. A piece next to the robot is safe if the hull does not touch it.
5. Write a complete program. Do not refuse.
6. Unless the user explicitly asks for ONE layout only, write ONE program that works for ALL 120 excavation layouts. Never hard-code red/green/black/blue/yellow slot order or a single unused color.

# 120 artefact layouts (WRO randomisation)
Official Junior: 5 colours, 4 on the excavation (left→right), 1 unused. Layouts = 5 unused × 24 permutations of the other 4 = 120.
- Injected every run (do not assign these at the top unless you are debugging ONE layout):
  colors = list of 4 live slot colours, 1-based: colors[1] is leftmost excavation.
  unused = the missing colour (string).
  held = "" at start; after pickup it is the colour just grabbed; after put_down it is "".
- Query geometry instead of baking this-round millimetres:
  slot_x(i) slot_y(i)  — excavation slot i = 1..4 left to right. Homes never move; only colours permute.
  museum_x(color) museum_y(color)  — exhibition pad for that colour. color may be held or colors[i].
- drive_to(x, y, heading) then pickup/put_down. Offset by the GRAB CENTER (gx, gy) of the tool you use:
  heading 0 pickup: drive_to(slot_x(i)+gx, slot_y(i)-gy, 0)
  heading 180 drop: drive_to(museum_x(held)-gx, museum_y(held)+gy, 180)
- Mission tab runs the current Program tab code on the visible layout.
- Simulation tab runs THAT SAME Program tab code on all 120 layouts and reports avg/min/max sim time.
- Do not emit a second program for simulation.

# Field
- Mat size: ${MAT.w} mm wide × ${MAT.h} mm tall. 1 unit = 1 mm.
- World origin (0,0) is the TOP-LEFT of the mat. +x right, +y down (screen y).
- Heading: 0° faces the excavation (toward +y, bottom of the mat). 180° faces the museum (toward -y, top). Heading increases CLOCKWISE.
- Straight motion: dx = -sin(heading°) * distance, dy = cos(heading°) * distance. Positive go_straight moves forward along current heading.
- The white road into the museum (top) and excavation (bottom) shares a black center line at world x = ${CORRIDOR_X} mm. The UI snaps the robot x to this line when close.
- Robot max envelope is 250 × 250 mm.

# Poses — plan from START, ignore live
- START (program start): x=${state.startX.toFixed(1)}, y=${state.startY.toFixed(1)}, heading=${wrapHeading(state.startH).toFixed(1)}, locked=${state.poseLocked}
- Live (do not plan from this): x=${state.x.toFixed(1)}, y=${state.y.toFixed(1)}, heading=${wrapHeading(state.heading).toFixed(1)}

# Robot shape (local frame: origin at chassis center, +x right, +y forward)
- Chassis length (front-back) = ${state.length} mm
- Chassis width (left-right) = ${state.width} mm
- Wheelbase W (track, wheel-center span) = ${state.W} mm
- Each wheel: length ${WHEEL_H} mm (along robot), thickness ${WHEEL_T} mm, glued to chassis; may sit outside the body but cannot detach
- Arms/grippers are NOT chassis. Their AABB is cut out of the chassis plate. Overlap with a tool is a tool contact, never a chassis contact.
- Axis-aligned envelope of whole robot in local mm: min=(${bounds.minX.toFixed(1)}, ${bounds.minY.toFixed(1)}), max=(${bounds.maxX.toFixed(1)}, ${bounds.maxY.toFixed(1)}), size ${spanX.toFixed(0)} × ${spanY.toFixed(0)} mm
- FRONT is the +y local face. Hangar draws FRONT up; the mission field draws FRONT toward heading 0 (excavation / bottom).

# Tools (1-based index among the same kind, in hangar parts order)
Arms (집게, kind arm):
${arms.length ? arms.map(fmtTool).join("\n") : "- none"}
Grippers (그리퍼, kind gripper):
${grips.length ? grips.map(fmtTool).join("\n") : "- none"}
Same-kind modules must keep ≥ ${MIN_GAP} mm gap.

# Artefacts — EXAMPLE of the currently visible round only
- keepArts (실험 배치 유지)=${state.keepArts}. useUnused=${state.useUnused}. Unused color THIS ROUND=${state.unused}${state.useUnused ? " (this color IS on the field too; 5 artefacts, extra slot left of excavation)" : " (NOT on field; 4 artefacts)"}. Size ${ART_W}×${ART_H} mm.
- Museum exhibition centers (GROUND TRUTH, same every round, y≈70.5): red (1009.5, 70.5), green (1141.5, 70.5), black (1273.5, 70.5), blue (1405.5, 70.5), yellow (1537.0, 70.5). Prefer museum_x(color) over copying these numbers.
- THIS ROUND slot colours left→right: ${state.slots.join(", ")}. Treat as an example. A robust program loops i=1..4 and uses colors[i] / slot_x(i) / museum_x(held).
- Example arm#1 poses for THIS ROUND only (do not copy colours into if-red/if-green trees):
${routes}

# pickup / put_down
- pickup(kind, index): the artefact L-shape (two 31×15 mm plates) must overlap the tool AABB inflated by ${GRAB_PAD} mm. Safest: put GRAB CENTER on the artefact center.
- While the artefact center is in that grab zone, chassis/tool overlap is NOT a foul (you are allowed to drive the jaws onto the piece).
- put_down: always drops at that tool's GRAB CENTER. It does not fail for chassis overlap. Then reverse straight until clear before turning.

# Collision (realistic SAT, not a turn circle)
- Artefacts are L-shaped (not circles). Robot is notched chassis + wheels + separate tools as oriented rectangles.
- A foul is actual overlapping geometry. Pieces beside the robot but not touching the hull are SAFE, even if they are inside the old circumradius.
- Driving the jaws onto a piece to pick it up is NOT a foul: if the artefact center is in a tool grab zone, ignore hull contact. Chassis/wheels hitting a piece outside the grab zone knocks it (STRUCK).
- The chassis plate is cut away under every arm/gripper. That bay is tool, not body.
- Visual: mission overlay is red notched chassis, green tools. Hangar chassis has hatched plate with tool-colored cutouts.
- A held artefact can knock other artefacts. Free artefacts also collide with each other (L-shape SAT): a pushed piece knocks neighbors instead of overlapping them.
- Between animation frames, motion is sub-stepped so fast turns do not tunnel through pieces.
- Visual: mission view draws the live hull only (red body, green tools). There is no keep-out circle.

# Language (Artefact Sim dialect — NOT Python)
This language only looks a bit like Python. Follow these rules exactly.

## Strings (bare words)
Quotes are OPTIONAL. A bare identifier that is not a declared variable/list name is a string.
  list(red, green, blue, black)
  colors.append(yellow)
  if slot == red:
  pickup(arm, 1)
  swing_turn(180, left)
Quoted strings also work: "red" or 'red'. Prefer BARE words in generated code.
Spaces inside a string still need quotes: "left wall"
Keywords are NOT strings: and or not in list len random True False if else while for
Declared names (after n = 0 or a list name like colors) are variables/lists, not strings.

## Motion
go_straight(mm, power)
  mm = number. power is +1 (forward) or -1 (backward) only. Speed is constant.
point_turn(heading)
  Turn in place until IMU heading equals heading (number, degrees).
swing_turn(heading, motor)
  motor is bare word left or right (the driving wheel). Other wheel is pivot.
drive_to(x, y, heading)
  Axis-aligned drive to world x,y then turn to heading. Prefer this with slot_*/museum_* for 120-layout programs.
pickup(kind, index)
  kind is bare word arm or gripper. index is 1-based among that kind. After pickup, variable held is the colour.
put_down(kind, index)
  same. held becomes "".
slot_x(i) slot_y(i)
  Excavation slot i (1-based, left to right). Same mm every round; colours in those slots change.
museum_x(color) museum_y(color)
  Museum pad for that colour. colors is injected each run as the 4 live slot colours. unused is the missing colour.

## Structure
Indent with 2 spaces. Comments start with # to end of line.
for _ in range(n):
  body
while True:
  body
while cond:
  body
if cond:
  body
else:
  body

## Values
n = 10
n = n + 1
colors = list(red, green, blue, black)
colors.append(yellow)
del colors[1]
colors.insert(1, red)
colors[1] = green
colors.clear()
len(colors)
red in colors
random(1, 10)
+ - * / %   == != < > <= >=   and or not
No other functions, no imports, no classes, no sensors.

# Program language (commands recap)
- go_straight(mm, power)
  mm = distance. power is SIGN ONLY: +1 forward, -1 backward. Speed is constant in the sim.
- point_turn(heading_deg)
  in-place IMU turn until heading equals heading_deg.
- swing_turn(heading_deg, motor)
  motor is identifier left or right (the DRIVING wheel). The other wheel is the pivot. Turn until IMU heading equals heading_deg.
- pickup(kind, index)
  kind is identifier arm or gripper. index is 1-based among that kind.
- put_down(kind, index)
  same arguments as pickup.

# Other language
- Already specified above. Do not emit Python quotes around red/green/arm/left unless the text contains spaces.
- Do not use Python standard library.

# Current program in the simulator
\`\`\`
${code.trim()}
\`\`\`

# What to return
1. Korean plan: loop over slots 1..4 with colors/held/slot_*/museum_* and grab-center offsets. Mention that the same program is used in 미션 (one layout) and 시뮬레이션 (120).
2. Full replacement program for the Program tab (blocks compile to this text). No layout-specific colour order.
3. Do not claim museum destinations, injected variables, or start-reset are unknown.
`;
}

export function refreshAiPrompt() {
  const out = document.getElementById("ai-prompt");
  if (!out) return;
  out.value = buildAiPrompt();
}
