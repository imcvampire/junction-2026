"""Minimal binary glTF 2.0 (GLB) writer for coloured boxes at true scale (metres, +Y up)."""

import json
import struct
from collections import defaultdict
from typing import Any

from api.orders.footprint import Box

_PALLET_COLOR = (0.62, 0.45, 0.27, 1.0)
_LINE_COLORS = [
    (0.16, 0.45, 0.85, 1.0),
    (0.93, 0.55, 0.13, 1.0),
    (0.20, 0.66, 0.42, 1.0),
    (0.80, 0.26, 0.42, 1.0),
    (0.52, 0.36, 0.80, 1.0),
    (0.10, 0.66, 0.70, 1.0),
]

# Six faces: (normal, four corners as unit-cube offsets, counter-clockwise seen from outside).
_FACES: list[tuple[tuple[float, float, float], list[tuple[int, int, int]]]] = [
    ((1, 0, 0), [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)]),
    ((-1, 0, 0), [(0, 0, 1), (0, 1, 1), (0, 1, 0), (0, 0, 0)]),
    ((0, 1, 0), [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)]),
    ((0, -1, 0), [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)]),
    ((0, 0, 1), [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]),
    ((0, 0, -1), [(1, 0, 0), (0, 0, 0), (0, 1, 0), (1, 1, 0)]),
]

_FLOAT, _UINT32 = 5126, 5125
_ARRAY_BUFFER, _ELEMENT_ARRAY_BUFFER = 34962, 34963


def _pad(data: bytes, fill: bytes) -> bytes:
    return data + fill * ((4 - len(data) % 4) % 4)


def build_glb(boxes: list[Box], line_names: list[str]) -> bytes:
    """One mesh primitive per colour group; the model is centred on the origin of the floor plane."""
    if boxes:
        min_x = min(b.x for b in boxes)
        max_x = max(b.x + b.w for b in boxes)
        min_z = min(b.z for b in boxes)
        max_z = max(b.z + b.d for b in boxes)
        cx, cz = (min_x + max_x) / 2, (min_z + max_z) / 2
    else:
        cx = cz = 0.0

    groups: defaultdict[int, list[Box]] = defaultdict(list)
    for b in boxes:
        groups[b.group].append(b)

    bin_chunk = bytearray()
    buffer_views: list[dict[str, int]] = []
    accessors: list[dict[str, Any]] = []
    materials: list[dict[str, object]] = []
    primitives: list[dict[str, object]] = []

    def add_view(data: bytes, target: int) -> int:
        offset = len(bin_chunk)
        bin_chunk.extend(_pad(data, b"\x00"))
        buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target})
        return len(buffer_views) - 1

    for group in sorted(groups):
        positions: list[float] = []
        normals: list[float] = []
        indices: list[int] = []
        for b in groups[group]:
            for normal, corners in _FACES:
                base = len(positions) // 3
                for ux, uy, uz in corners:
                    positions += [b.x - cx + ux * b.w, b.y + uy * b.h, b.z - cz + uz * b.d]
                    normals += normal
                indices += [base, base + 1, base + 2, base, base + 2, base + 3]

        xs, ys, zs = positions[0::3], positions[1::3], positions[2::3]
        pos_view = add_view(struct.pack(f"<{len(positions)}f", *positions), _ARRAY_BUFFER)
        nrm_view = add_view(struct.pack(f"<{len(normals)}f", *normals), _ARRAY_BUFFER)
        idx_view = add_view(struct.pack(f"<{len(indices)}I", *indices), _ELEMENT_ARRAY_BUFFER)
        count = len(positions) // 3
        accessors += [
            {
                "bufferView": pos_view,
                "componentType": _FLOAT,
                "count": count,
                "type": "VEC3",
                "min": [min(xs), min(ys), min(zs)],
                "max": [max(xs), max(ys), max(zs)],
            },
            {"bufferView": nrm_view, "componentType": _FLOAT, "count": count, "type": "VEC3"},
            {"bufferView": idx_view, "componentType": _UINT32, "count": len(indices), "type": "SCALAR"},
        ]
        color = _PALLET_COLOR if group < 0 else _LINE_COLORS[group % len(_LINE_COLORS)]
        name = "pallet" if group < 0 else (line_names[group] if group < len(line_names) else f"line {group}")
        materials.append(
            {
                "name": name,
                "pbrMetallicRoughness": {"baseColorFactor": list(color), "metallicFactor": 0.0, "roughnessFactor": 0.8},
            }
        )
        a = len(accessors) - 3
        primitives.append(
            {"attributes": {"POSITION": a, "NORMAL": a + 1}, "indices": a + 2, "material": len(materials) - 1}
        )

    gltf: dict[str, object] = {
        "asset": {"version": "2.0", "generator": "junction-2026-api"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "order", "mesh": 0}] if primitives else [{"name": "order"}],
    }
    if primitives:
        gltf |= {
            "meshes": [{"name": "order", "primitives": primitives}],
            "materials": materials,
            "accessors": accessors,
            "bufferViews": buffer_views,
            "buffers": [{"byteLength": len(bin_chunk)}],
        }

    json_chunk = _pad(json.dumps(gltf, separators=(",", ":")).encode(), b" ")
    chunks = struct.pack("<II", len(json_chunk), 0x4E4F534A) + json_chunk
    if bin_chunk:
        chunks += struct.pack("<II", len(bin_chunk), 0x004E4942) + bytes(bin_chunk)
    return struct.pack("<III", 0x46546C67, 2, 12 + len(chunks)) + chunks
