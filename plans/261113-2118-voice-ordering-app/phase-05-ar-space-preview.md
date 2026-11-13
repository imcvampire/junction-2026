---
phase: 5
title: AR space preview
status: todo
depends_on: [2, 4]
---

# Phase 5 — AR space preview

## Requirements

- Offered only after the buyer agrees (`flow_state = ar_offered`), before placement.
- BE computes the physical footprint of the order: case count per line from ordered quantity and
  sales unit; case dimensions from `synkkaData.unitConversions[]`; stack into a simple pallet-style
  block layout (configurable max stack height, e.g. 1.6 m; EUR pallet 1200×800 mm footprint).
- `GET /api/orders/{id}/ar-model.glb` returns a true-scale glTF (metres), one coloured block group
  per order line, plus `GET /api/orders/{id}/footprint` → `{ width_m, depth_m, height_m, volume_m3, pallets, lines[] }`
  so the app can also say it aloud ("about 2 pallets, 1.2 by 1.6 metres").
- App shows `<model-viewer ar ar-modes="webxr scene-viewer quick-look" ar-scale="fixed">` so the model
  cannot be resized by pinch — true scale is the point.
- Lines with no dimensions: estimate from volume/weight and label as estimate; if nothing usable,
  hide AR for that line and say why.

## Files

- Create: `apps/api/src/api/orders/footprint.py`, `apps/api/src/api/orders/gltf.py`
  (pure-Python glTF writer or `trimesh`), route additions in `apps/api/src/api/routes/orders.py`
- Create: `apps/web/src/features/ar/ar-preview.tsx`
- Tests: `apps/api/tests/test_footprint.py` (known case dims × quantity → expected block count and bounds)

## Validation

- Footprint unit tests.
- Manual: place the model on a floor on iOS (Quick Look) and Android (Scene Viewer); measure a known
  1 m reference with a tape to confirm scale.

## Risks

- iOS Quick Look needs USDZ; `<model-viewer>` converts glTF on the fly — verify on target iOS version.
- Case-level dimensions may not reflect pallet packing; accept as an approximation and say so in UI.
