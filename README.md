# Induction Period Reader

A single-page browser tool that reads the induction period off a Rancimat conductivity trace by
fitting the four-parameter kappa response, and reports both readings admitted by the standard with
bootstrap intervals.

Live: https://devstat.org/tools/induction-period

Nothing is uploaded and nothing is stored. The fit runs in the visitor's browser.

## What it does

Given a two-column trace (time, conductivity) it fits

    y = g0 + m x + g1 F(x; mu, sigma, k, h)

where `F` is the four-parameter kappa distribution function, then computes both standard readings
**from the fitted curve** rather than by differentiating the recorded data:

* the **tangent** reading, where the steepest tangent meets the drifting baseline;
* the **second-derivative** reading, the inflection below the steepest point.

It reports a 95% percentile interval on each from a 400-resample residual bootstrap, and states
whether the two readings can be reconciled for that oil — that is, whether the fitted shape lies on
the curve in the shape plane where they coincide.

## Why some readings are blank

A blank second reading is not a failure. Beyond a frontier in the fourth shape parameter that
reading ceases to exist for the fitted curve. A reading falling outside its own run is also
withheld, because an induction period cannot exceed the experiment that measured it.

## The estimator

Both shape parameters are searched over the whole physically meaningful range, negative `h`
included. That region matters: the log-logistic used for data reduction in many laboratories is the
kappa member at `h = -1`, and the sigmoid of the five-parameter logistic is the Burr III family at
`h = -1/m`. An estimator restricted to `h >= 0` cannot reach either.

The constraint imposed instead is on the **observable**: the plateau must rise, and the fitted
induction period must lie inside the run that measured it.

## Parity with the reference implementation

`k4.js` is a port of the C back end of the R/Python package `arcstat`. It is tested rather than
assumed to agree:

    node parity.mjs        # 14 traces, against parity_R.csv produced by parity_R.R
    node testsuite.mjs     # all 98 archive runs, against reference_98.json

Across all 98 runs the presence or absence of each reading matches, and the largest disagreement in
an induction period is **4.85e-5 hours, about 0.17 seconds** — which is the precision at which the
reference values are stored, so the agreement is exact to the limit of the comparison.

The page carries a self-test over eight of those runs, chosen for the awkward cases: a shape on the
wall of the admissible set, shapes deep in the negative half-line, runs whose second reading does
not exist, the generalised extreme value member, and the shortest and longest induction periods in
the set.

## Running the checks

    node _mkprobe.mjs        rebuild `_probe.mjs` from `index.html`; needed once after cloning,
                             and again after any change to the app
    node testsuite.mjs       fit the eight traces bundled in `selftest_cases.json` and compare
                             against `reference_focke.json`; exits non-zero on failure
    node testsuite.mjs FILE  the same over every reference run whose trace is in FILE, the archive
                             CSV held with the paper's materials

`parity.mjs` and `parity_R.R` are the fourteen-trace R-against-JavaScript harness. They read traces
that are part of the paper's materials and are not distributed here, so they take the directory as
an argument (`node parity.mjs /path/to/traces/`, and `RANCIMAT_KAPPA4_DIR` for the R side) rather
than assuming one. Without those materials, `node testsuite.mjs` is the check that runs anywhere.

## Layout

    index.html            the whole tool, assembled and self-contained
    k4.js                 the engine, as an ES module (for the tests)
    head.html body.html   page head and markup
    app.js ctrl.js        fitter/plot, and the controller
    build.py              assembles the above into index.html
    parity.mjs parity_R.R the 14-trace parity harness
    testsuite.mjs         the reference suite, bundled traces by default
    _mkprobe.mjs          rebuilds the node-side probe from index.html
    selftest_cases.json   the eight traces embedded in the page

## Licence and data

The code is MIT (see `LICENSE`). The licence file is the MIT text and nothing else, so that it is
detected as MIT; the restrictions on the data are stated in `NOTICE`.

The conductivity traces embedded in `selftest_cases.json` and `example_trace.txt` are from the
archive of the Institute of Applied Materials, University of Pretoria, and are included with the
written permission of W. W. Focke. They are **not** covered by the MIT licence and are not to be
redistributed separately.

`reference_focke.json` covers only the runs this repository is free to distribute. The seven
Spanish-cultivar oils analysed in the accompanying paper are excluded: they were supplied by the
A Coruna group for that analysis, which is not the same as permission to redistribute. The full
98-run reference is held with the paper's materials.

## Citing this tool

Metadata for citation is in `CITATION.cff`, and `.zenodo.json` supplies the same information to
Zenodo when a release is archived. Cite the archived release rather than a website address: a
company or personal domain outlives neither, and a dead link in a published paper is permanent.
