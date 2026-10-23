# Workspace interaction and motion

Product E9 adds frontend interaction polish after the visual model builder. It
uses native CSS, existing Radix dialogs and Cytoscape viewport animations. No
animation library, API contract, simulation parameter or result value changes.

## Behaviour

- Shared buttons give a small hover lift, press response, selected-state feedback
  and directional icon movement. Disabled actions remain disabled. Pending save,
  import, comparison and simulation actions expose `aria-busy`; their indicators
  describe actual requests rather than estimated completion percentages.
- Navigation highlights, command search, inspector drawers, module changes,
  disclosures, field focus, table rows and operating cards use short transitions.
  Most take 120–180 ms; dialog and module entry take 240 ms. Hover movement is
  restricted to fine pointers. Focus outlines remain visible for keyboard users.
- Lazy module loading shows a labelled loading surface. Shimmer and spinners run
  only while the relevant work is pending; there is no continuous canvas motion.
- Builder validation, save/import feedback and selected inspectors appear with
  restrained entry feedback. Messages remain available until the next operation.
  Success indicators acknowledge an operation, not model accuracy or a recovered
  stockout. Error feedback uses neutral colours; orange remains reserved for
  stockouts throughout the application.
- Builder data sections are semantic tabs. Left/right arrows wrap; Home/End jump
  to the first/last section. The active panel has a label and keyboard focus target.
  Selected facility/SKU rows remain visible in the corresponding master table.
- The builder canvas has a quiet diagram grid, zoom percentage, native toolbar
  hints and nearby lane highlighting on facility hover. Zoom is centred on the
  viewport; explicit fit/zoom actions animate for 180 ms. A subsequent action
  interrupts the previous viewport movement. Dragging, geographic edits, automatic
  topology updates and simulation health scrubbing are not animated flights.

## Motion preference

The accessibility button in the workspace header opens **Motion preferences**.
**Follow device** is the default and listens for operating-system preference
changes. **Reduce motion** also disables movement even when the device permits it.
The preference is browser-local (`scm-motion-preference`), independent of saved
models and simulation provenance. It synchronises across tabs. If browser storage
rejects a write, the choice still works for the open page; it cannot survive reload.

Both choices respect a device-level reduced-motion request. Reduced motion removes
CSS animations, transitions and hover transforms, makes viewport actions immediate,
and stops active canvas animation. Static labels, loading icons, keyboard feedback
and status messages remain. Dialog focus trapping, Escape, close and focus return
continue to use the existing Radix behaviour.

Charts continue to show exact scientific values without count-up effects. Model
edits, source captions, exports, immutable launch snapshots and engine/cache
semantics are unchanged. Opening motion preferences preserves an unsaved draft;
it does not persist that draft. Save/export before leaving a model workspace.

## Verification

`web/e2e/motion.spec.ts` exercises normal and reduced motion, actual server save
feedback, keyboard sections, repeated viewport actions, preference persistence,
cross-tab updates, denied storage, dark/narrow-screen dialogs and focus restoration.
The full project check also retains the 100-node Control Tower performance test.
Screenshots cover the builder canvas and motion settings. This focused interaction
pass does not complete M11's broader deployment/accessibility audit.
