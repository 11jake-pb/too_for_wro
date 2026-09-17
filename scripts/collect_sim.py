"""Headless collect-all probe matching js geom/collision."""
from __future__ import annotations

import math

GRAB_PAD = 22
WHEEL_H, WHEEL_T = 64, 12
SLOTS = [(1076.0, 1077.0), (1207.8, 1077.0), (1339.5, 1077.0), (1471.5, 1077.0)]
MUSEUM = {
    "red": (1009.5, 70.5),
    "green": (1141.5, 70.5),
    "black": (1273.5, 70.5),
    "blue": (1405.5, 70.5),
}
ART_BOXES = [
    dict(minX=-23.4, maxX=7.8, minY=-15.4, maxY=-0.2),
    dict(minX=-7.8, maxX=23.4, minY=0.2, maxY=15.4),
]

state = {
    "x": 420.0,
    "y": 720.0,
    "heading": 0.0,
    "startX": 420.0,
    "startY": 720.0,
    "startH": 0.0,
    "length": 200.0,
    "width": 180.0,
    "W": 130.0,
    "parts": [
        dict(id=1, kind="clamp", x=0, y=64, face="front", w=36, d=52),
        dict(id=2, kind="gripper", x=0, y=-72, face="back", w=40, d=44),
    ],
    "slots": ["red", "green", "blue", "black"],
    "arts": [],
    "prevX": 420.0,
    "prevY": 720.0,
    "prevH": 0.0,
}


def wrap_heading(deg):
    h = ((deg + 180) % 360) - 180
    if h <= -180:
        h += 360
    return h


def pose_forward(h):
    r = math.radians(h)
    return -math.sin(r), math.cos(r)


def pose_right(h):
    r = math.radians(h)
    return -math.cos(r), -math.sin(r)


def local_to_world(lx, ly, pose):
    fx, fy = pose_forward(pose["heading"])
    rx, ry = pose_right(pose["heading"])
    return pose["x"] + lx * rx + ly * fx, pose["y"] + lx * ry + ly * fy


def world_to_local(wx, wy, pose):
    dx, dy = wx - pose["x"], wy - pose["y"]
    fx, fy = pose_forward(pose["heading"])
    rx, ry = pose_right(pose["heading"])
    return dx * rx + dy * ry, dx * fx + dy * fy


def module_aabb(part):
    across, along = part["w"], part["d"]
    if part["face"] in ("front", "back"):
        sign = 1 if part["face"] == "front" else -1
        return dict(
            minX=part["x"] - across / 2,
            maxX=part["x"] + across / 2,
            minY=min(part["y"], part["y"] + sign * along),
            maxY=max(part["y"], part["y"] + sign * along),
        )
    sign = 1 if part["face"] == "right" else -1
    return dict(
        minX=min(part["x"], part["x"] + sign * along),
        maxX=max(part["x"], part["x"] + sign * along),
        minY=part["y"] - across / 2,
        maxY=part["y"] + across / 2,
    )


def inflate(box, m):
    return dict(minX=box["minX"] - m, maxX=box["maxX"] + m, minY=box["minY"] - m, maxY=box["maxY"] + m)


def subtract_aabb(src, cut):
    ix, ax = max(src["minX"], cut["minX"]), min(src["maxX"], cut["maxX"])
    iy, ay = max(src["minY"], cut["minY"]), min(src["maxY"], cut["maxY"])
    if ix >= ax or iy >= ay:
        return [src]
    out = []
    if src["minY"] < iy:
        out.append(dict(minX=src["minX"], maxX=src["maxX"], minY=src["minY"], maxY=iy))
    if ay < src["maxY"]:
        out.append(dict(minX=src["minX"], maxX=src["maxX"], minY=ay, maxY=src["maxY"]))
    if src["minX"] < ix:
        out.append(dict(minX=src["minX"], maxX=ix, minY=iy, maxY=ay))
    if ax < src["maxX"]:
        out.append(dict(minX=ax, maxX=src["maxX"], minY=iy, maxY=ay))
    return [b for b in out if b["maxX"] - b["minX"] > 0.4 and b["maxY"] - b["minY"] > 0.4]


def chassis_body_boxes():
    plate = dict(minX=-state["width"] / 2, maxX=state["width"] / 2, minY=-state["length"] / 2, maxY=state["length"] / 2)
    boxes = [plate]
    for p in state["parts"]:
        nxt = []
        for b in boxes:
            nxt.extend(subtract_aabb(b, module_aabb(p)))
        boxes = nxt
    for b in boxes:
        b["role"] = "body"
    return boxes


def wheel_geom():
    half = state["W"] / 2
    t = WHEEL_T / 2
    return {
        "left": dict(x=-half - t, w=WHEEL_T, y=-WHEEL_H / 2, h=WHEEL_H),
        "right": dict(x=half - t, w=WHEEL_T, y=-WHEEL_H / 2, h=WHEEL_H),
    }


def hull_boxes(include_tools):
    g = wheel_geom()
    boxes = list(chassis_body_boxes())
    for side in ("left", "right"):
        w = g[side]
        boxes.append(dict(minX=w["x"], maxX=w["x"] + w["w"], minY=w["y"], maxY=w["y"] + w["h"], role="body"))
    if include_tools:
        for p in state["parts"]:
            boxes.append({**module_aabb(p), "role": "tool"})
    return boxes


def box_world_poly(box, pose):
    corners = [
        (box["minX"], box["minY"]),
        (box["maxX"], box["minY"]),
        (box["maxX"], box["maxY"]),
        (box["minX"], box["maxY"]),
    ]
    return [local_to_world(x, y, pose) for x, y in corners]


def art_pose(art, robot_pose):
    return dict(x=art["x"], y=art["y"], heading=robot_pose["heading"] if art["held"] else 0)


def art_world_polys(art, robot_pose):
    pose = art_pose(art, robot_pose)
    return [box_world_poly(b, pose) for b in ART_BOXES]


def project(poly, ax, ay):
    vs = [p[0] * ax + p[1] * ay for p in poly]
    return min(vs), max(vs)


def sat_mtv(poly_a, poly_b):
    best, nx, ny = math.inf, 0.0, 0.0
    for poly in (poly_a, poly_b):
        for i, a in enumerate(poly):
            b = poly[(i + 1) % len(poly)]
            tx, ty = b[1] - a[1], a[0] - b[0]
            ln = math.hypot(tx, ty) or 1
            tx, ty = tx / ln, ty / ln
            amin, amax = project(poly_a, tx, ty)
            bmin, bmax = project(poly_b, tx, ty)
            if amax < bmin or bmax < amin:
                return None
            overlap = min(amax, bmax) - max(amin, bmin)
            if overlap < best:
                best, nx, ny = overlap, tx, ty
    if not math.isfinite(best):
        return None
    cxa = sum(p[0] for p in poly_a) / len(poly_a)
    cya = sum(p[1] for p in poly_a) / len(poly_a)
    cxb = sum(p[0] for p in poly_b) / len(poly_b)
    cyb = sum(p[1] for p in poly_b) / len(poly_b)
    if (cxb - cxa) * nx + (cyb - cya) * ny < 0:
        nx, ny = -nx, -ny
    return dict(x=nx * best, y=ny * best, depth=best)


def first_mtv(polys_a, polys_b):
    best = None
    for r in polys_a:
        for a in polys_b:
            m = sat_mtv(r, a)
            if m and (best is None or m["depth"] > best["depth"]):
                best = m
    return best


def in_grab_zone(art, pose):
    c = world_to_local(art["x"], art["y"], pose)
    for p in state["parts"]:
        g = inflate(module_aabb(p), GRAB_PAD)
        if g["minX"] <= c[0] <= g["maxX"] and g["minY"] <= c[1] <= g["maxY"]:
            return True
    return False


def hull_hits_art(art, pose, include_tools):
    art_polys = art_world_polys(art, pose)
    body = [box_world_poly(b, pose) for b in hull_boxes(False)]
    body_hit = first_mtv(body, art_polys)
    tool_hit = None
    if include_tools:
        tools = [box_world_poly(b, pose) for b in hull_boxes(True) if b["role"] == "tool"]
        tool_hit = first_mtv(tools, art_polys)
    return body_hit, tool_hit


def push_art(art, mtv, extra=3):
    ln = math.hypot(mtv["x"], mtv["y"]) or 1
    art["x"] += mtv["x"] + mtv["x"] / ln * extra
    art["y"] += mtv["y"] + mtv["y"] / ln * extra


def resolve_hits(pose, grab_excuses_body=False):
    hit = False
    driven = set()

    def knock(art, mtv):
        nonlocal hit
        if not art["struck"]:
            art["struck"] = True
            hit = True
        if mtv:
            push_art(art, mtv)
        driven.add(id(art))

    for _ in range(6):
        for art in state["arts"]:
            if art["held"]:
                continue
            body_hit, tool_hit = hull_hits_art(art, pose, True)
            grab = in_grab_zone(art, pose)
            if grab_excuses_body:
                foul = (body_hit and not grab) or (tool_hit and not grab)
            else:
                foul = body_hit or (tool_hit and not grab)
            if not foul:
                continue
            mtv = body_hit if body_hit and (not tool_hit or body_hit["depth"] >= tool_hit["depth"]) else tool_hit
            knock(art, mtv)
        helds = [a for a in state["arts"] if a["held"]]
        frees = [a for a in state["arts"] if not a["held"]]
        for held in helds:
            hp = art_world_polys(held, pose)
            for art in frees:
                mtv = first_mtv(hp, art_world_polys(art, pose))
                if mtv:
                    knock(art, mtv)
        free = [a for a in state["arts"] if not a["held"]]
        for i, a in enumerate(free):
            for b in free[i + 1 :]:
                mtv = first_mtv(art_world_polys(a, pose), art_world_polys(b, pose))
                if not mtv:
                    continue
                da, db = id(a) in driven, id(b) in driven
                extra, ln = 1.2, math.hypot(mtv["x"], mtv["y"]) or 1
                ux, uy = mtv["x"] / ln, mtv["y"] / ln
                if da and not db:
                    push_art(b, mtv)
                    driven.add(id(b))
                elif db and not da:
                    push_art(a, dict(x=-mtv["x"], y=-mtv["y"]))
                    driven.add(id(a))
                else:
                    a["x"] -= mtv["x"] * 0.5 + ux * extra * 0.5
                    a["y"] -= mtv["y"] * 0.5 + uy * extra * 0.5
                    b["x"] += mtv["x"] * 0.5 + ux * extra * 0.5
                    b["y"] += mtv["y"] * 0.5 + uy * extra * 0.5
                if da or db or a["struck"] or b["struck"]:
                    if not a["struck"]:
                        a["struck"] = True
                        hit = True
                    if not b["struck"]:
                        b["struck"] = True
                        hit = True
    return hit


def lerp_pose(a, b, t):
    dh = ((b["heading"] - a["heading"] + 540) % 360) - 180
    return dict(x=a["x"] + (b["x"] - a["x"]) * t, y=a["y"] + (b["y"] - a["y"]) * t, heading=a["heading"] + dh * t)


def tool_part(kind, index):
    hangar = "gripper" if kind == "gripper" else "clamp"
    n = 0
    for p in state["parts"]:
        if p["kind"] != hangar:
            continue
        n += 1
        if n == index:
            return p
    return None


def tool_center(part):
    b = module_aabb(part)
    return (b["minX"] + b["maxX"]) / 2, (b["minY"] + b["maxY"]) / 2


def pickup_target(kind, index, pose):
    part = tool_part(kind, index)
    grab = inflate(module_aabb(part), GRAB_PAD)
    gp = [box_world_poly(grab, pose)]
    for a in state["arts"]:
        if a["held"]:
            continue
        if first_mtv(gp, art_world_polys(a, pose)):
            return a
    return None


def drop_blocked(art, pose, grab_ok=False):
    body = [box_world_poly(b, pose) for b in hull_boxes(False)]
    hit = first_mtv(body, art_world_polys(art, pose))
    if not hit:
        return False
    if grab_ok and in_grab_zone(art, pose):
        return False
    return True


def sync_held():
    pose = dict(x=state["x"], y=state["y"], heading=state["heading"])
    for art in state["arts"]:
        if not art["held"]:
            continue
        part = tool_part(art["held"]["kind"], art["held"]["index"])
        cx, cy = tool_center(part)
        art["x"], art["y"] = local_to_world(cx, cy, pose)


def apply_pose(x, y, heading, grab_excuses_body=False):
    prev = dict(x=state["x"], y=state["y"], heading=state["heading"])
    pose = dict(x=x, y=y, heading=heading)
    dh = abs(((pose["heading"] - prev["heading"] + 540) % 360) - 180)
    dist = math.hypot(pose["x"] - prev["x"], pose["y"] - prev["y"])
    steps = max(1, min(10, math.ceil(dh / 7 + dist / 18)))
    hit = False
    for s in range(1, steps + 1):
        p = lerp_pose(prev, pose, s / steps)
        state["x"], state["y"], state["heading"] = p["x"], p["y"], p["heading"]
        sync_held()
        if resolve_hits(p, grab_excuses_body=grab_excuses_body):
            hit = True
    state["prevX"], state["prevY"], state["prevH"] = x, y, heading
    return hit


def reset():
    state["x"], state["y"], state["heading"] = state["startX"], state["startY"], state["startH"]
    state["arts"] = [
        dict(color=c, x=SLOTS[i][0], y=SLOTS[i][1], held=None, struck=False)
        for i, c in enumerate(state["slots"])
    ]
    state["prevX"], state["prevY"], state["prevH"] = state["x"], state["y"], state["heading"]


def run(grab_excuses_body=False, drop_grab_ok=False, label=""):
    reset()
    gx, gy = tool_center(tool_part("arm", 1))
    print(f"\n===== {label} grab=({gx:.1f},{gy:.1f}) =====")
    ok_pick = ok_drop = 0

    def go_straight(mm, power):
        dist = mm * (1 if power >= 0 else -1)
        rad = math.radians(state["heading"])
        hit = apply_pose(
            state["x"] - math.sin(rad) * dist,
            state["y"] + math.cos(rad) * dist,
            state["heading"],
            grab_excuses_body,
        )
        if hit:
            struck = [f"{a['color']}@{a['x']:.0f},{a['y']:.0f}" for a in state["arts"] if a["struck"]]
            print(f"  COLLIDE go_straight({mm},{power}) {struck}")

    def point_turn(h):
        hit = apply_pose(state["x"], state["y"], h, grab_excuses_body)
        if hit:
            struck = [f"{a['color']}@{a['x']:.0f},{a['y']:.0f}" for a in state["arts"] if a["struck"]]
            print(f"  COLLIDE point_turn({h}) {struck}")

    def go_xyh(x, y, h):
        dx, dy = x - state["x"], y - state["y"]
        if abs(dx) >= 0.5:
            point_turn(-90 if dx > 0 else 90)
            go_straight(abs(dx), 1)
        if abs(dy) >= 0.5:
            point_turn(0 if dy > 0 else 180)
            go_straight(abs(dy), 1)
        point_turn(h)

    for color in list(state["slots"]):
        live = next(a for a in state["arts"] if a["color"] == color)
        px, py = live["x"] + gx, live["y"] - gy
        print(f"-- {color} pick ({px:.1f},{py:.1f}) art=({live['x']:.1f},{live['y']:.1f})")
        go_xyh(px, py, 0)
        pose = dict(x=state["x"], y=state["y"], heading=state["heading"])
        body, tool = hull_hits_art(live, pose, True)
        print(
            f"   arrive ({state['x']:.1f},{state['y']:.1f},{wrap_heading(state['heading']):.1f}) "
            f"grab={in_grab_zone(live, pose)} body={None if not body else round(body['depth'], 2)} "
            f"tool={None if not tool else round(tool['depth'], 2)} struck={live['struck']}"
        )
        tgt = pickup_target("arm", 1, pose)
        if not tgt:
            print("   PICKUP FAIL")
            for a in state["arts"]:
                print(f"     {a['color']} {a['x']:.1f},{a['y']:.1f} held={a['held']} struck={a['struck']}")
            break
        tgt["held"] = dict(kind="arm", index=1)
        tgt["struck"] = False
        sync_held()
        ok_pick += 1
        print(f"   pickup OK {tgt['color']}")
        go_straight(180, -1)
        mu = MUSEUM[color]
        go_xyh(mu[0] - gx, mu[1] + gy, 180)
        pose = dict(x=state["x"], y=state["y"], heading=state["heading"])
        cx, cy = tool_center(tool_part("arm", 1))
        drop = local_to_world(cx, cy, pose)
        tgt["x"], tgt["y"] = drop
        blocked = drop_blocked(tgt, pose, grab_ok=drop_grab_ok)
        print(f"   drop at {drop[0]:.1f},{drop[1]:.1f} blocked={blocked} grab={in_grab_zone(tgt, pose)}")
        if blocked:
            print("   PUT_DOWN FAIL")
            break
        tgt["held"] = None
        ok_drop += 1
        go_straight(160, -1)

    print("result:")
    for a in state["arts"]:
        mu = MUSEUM[a["color"]]
        err = math.hypot(a["x"] - mu[0], a["y"] - mu[1])
        print(f"  {a['color']} held={a['held']} struck={a['struck']} {a['x']:.1f},{a['y']:.1f} err={err:.1f}")
    print(f"picked {ok_pick} dropped {ok_drop}")
    return ok_pick, ok_drop


if __name__ == "__main__":
    run(False, False, "current rules")
    run(True, True, "grab excuses body + drop")
