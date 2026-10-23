# Interactive network builder

Open `/?view=builder`. This is a source-backed editor for the engine's supported
supplier → DC → retailer/B2B network. It edits actual master data and operating
assumptions, validates them through the engine and embeds a versioned snapshot in
every launched request. It is not an arbitrary graph simulator or a map service.

## Design workflow

Start from the reference configuration, a saved model, an imported model package,
a ModelSnapshot or a RunRequest containing `model`. Give the model a name and
record input sources/assumptions. Reference rows are synthetic and copied from
the canonical configuration; a duplicate is not a calibrated new facility.

The canvas supports pan/zoom, fit, facility selection, lane selection, shift-box
selection, group movement and PNG export. The echelon layout lets you arrange
diagram positions without changing geography. Geographic sketch mode instead
maps longitude/latitude to the canvas: dragging explicitly changes geographic
coordinates, which can change computed distances, lead times and DC selection.
There are no external basemap tiles or route-service estimates. PNG dimensions
are bounded to 4096 pixels in each direction.

Use **Connect DC → customer** and click an open DC followed by its retailer/B2B
customer to set replenishment routing. The inspector offers the equivalent
customer/DC selector for keyboard access. The facility table also selects any
facility without using the canvas. Dashed DC squares are candidates; opening a
DC switches to an explicit open set. Automatic mode uses the existing demand-
distance k-median selection and nearest-open-DC assignment. Explicit customer
assignments override nearest routing. Closing/removing a DC clears assignments
to it, so those customers return to automatic assignment. Undo can restore them.

The inspector edits all supported supplier/DC/customer attributes, names and
identifiers. Renaming updates sourcing, assignments, lane overrides, positions
and operating references. Deletion protects the last row in an echelon, suppliers
still referenced by a SKU and facilities targeted by disruption events. Customer
deletion compacts remaining region indices while preserving their grouping.
Duplicate/add actions copy an existing row and choose a unique ID. Review the
copied coordinates, demand and economics before using it in an experiment.

The SKU table edits primary sourcing directly. Inspect a SKU to edit unit cost,
demand mean/CV/type, pack size, MOQ and value class. Retailer daily arrival
probability must be one; B2B arrivals may be intermittent. Region indices must
be nonnegative and below the customer count. The editor keeps original engine
meanings; it does not introduce additional product demand models.

## Lanes, economics and run design

Resolved lanes come from the same network builder used in a simulation. Selected
suppliers can feed each open DC; each customer has one replenishment DC. SKU
primary sourcing and backup assumptions determine which supply lanes carry stock.
A drawn supplier/DC lane does not guarantee flow or create a second primary source.

Select a lane to override road distance, lead mean/CV and extra-delay probability/
days. Blank fields inherit geography/supplier/outbound settings. A distance-only
override also changes the distance portion of inherited lead time. An explicit
lead mean replaces that derived mean. Capacity still belongs to the dispatching
facility, and freight economics are model-wide FTL/LTL settings. Inactive lane
overrides are retained and labelled in validation warnings. Reset removes an
override; this does not remove a generated physical lane.

**Economics** edits model transport and inventory parameters with their original
units. **Experiment** edits seed, replications, warm-up, measured horizon, policy,
forecast, seasonality and existing operational overrides. Snapshot master data
are the base; `lab` overrides apply afterwards. The same precedence is recorded
in provenance. Manual open sets determine the DC count; edit them in the builder.
Without an explicit scenario selection, custom models select their own suppliers
and a DC count bounded by their candidate count, rather than reference IDs.

Preview is debounced and compiles topology without running replications. Invalid
references, unsupported echelon connections, duplicate IDs/lanes, invalid values,
closed-DC assignments and resource-budget violations produce visible errors.
When the draft changes, old automatic routing is not presented as newly validated.
The capacity chart shows configured input capacity; achieved throughput comes from
a completed run. Diagram positions do not affect the physics cache identity.

## Save, revise and simulate

The workspace now includes [interaction and motion controls](interaction-motion.md):
keyboard-operable data tabs, selected master rows, pending-action feedback, a zoom
readout and deliberate viewport transitions. Use the header's Motion preferences
to follow the device or reduce movement. These choices do not alter the model.

Save persists the entire RunRequest, model snapshot, name and notes through the
existing Planning Lab store. Save-as-new creates a separate model. Saved models
have optimistic revisions; a stale save returns a conflict instead of replacing
another edit. Every new saved revision is retained in SQLite. Revision selection
loads the old definition as a draft; saving creates a new revision. Older stores
are migrated by preserving their current definition, not inventing past revisions.

Run a saved, unchanged model. Immutable execution history retains the actual model
revision/request, even when newer revisions exist. Completed runs can be opened
in Control Tower and inspected through the existing SKU/facility/lane diagnostics.
Download execution snapshots and model provenance for review. Opening the model
in Planning Lab preserves its custom supplier/SKU context and full request.

The model package uses `format: openscm-model-v1`; the nested snapshot uses
`format_version: 1`. JSON imports are validated before becoming a new draft;
unsupported versions and malformed models cannot overwrite a saved model. Package
name/notes are bounded by the existing scenario limits. File/text imports are
bounded to 2 MB in the editor. Import/export retains diagram positions, source
notes, operating overrides and scenario settings. No executable code is imported.

When a layout-only change reuses a cached physics result, run provenance retains
the original computation request. The current launch's revision and diagram are
preserved in its execution snapshot and the exported model package.

Undo/redo retains up to 100 draft snapshots for model edits in the current page.
Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z work outside text inputs. Saved revisions survive
restart; unsaved drafts and their undo stack are session state. Save or export
before leaving the module. Browser reload warns after unsaved model edits; this
does not replace saving. The source starter remains editable while the API is
unavailable, but validation, save/history and simulation require the API.

## Reproducibility and limits

The public NetworkSpec now lives in contracts; compatibility imports preserve
existing engine callers. Optional explicit DCs, assignments and lane overrides
default to the original behaviour. Positive DC counts up to 32 replace the old
four-choice wire restriction; actual candidate count is still validated. Existing
reference presets and historical run reads remain supported.

Run identity includes effective physical inputs, source/version fingerprints,
operating options and seeds. Diagram layout alone reuses the same physics result.
Custom-model paired comparisons require matching ordered supplier, DC-candidate,
customer and SKU identities, protecting the pre-drawn stream indexing. Parameter,
geography, routing and open-set comparisons within that master remain available;
structurally different master lists need separate interpretation.

Resource bounds and every introduced default are documented in
[parameters](parameters.md). Synthetic simulation does not establish empirical
validity: calibrate units, demand, transit, capacity and cost, validate held-out
behaviour, use suitable replications and confirm alternatives with independent
seeds before operational use. Manufacturing/BOM, cyclic routing, lateral
transshipment, map tiles and per-lane capacity/economics are separate extensions.
This remains a private single-server workspace, without multi-tenant access control.
