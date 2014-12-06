var canvas = document.getElementById("drawCanvas");
if (canvas !== null) {
    var numWires = 4;
    var numStates = 1 << numWires;

    var ctx = canvas.getContext("2d");
    var painter = new Painter(ctx);

    // --- Layout Constants ---
    var gateRadius = 20;
    var circuitOperationHorizontalSpacing = 10;
    /**
     * @type {GateColumn[]}
     */
    var circuitOperationColumns = [];

    var TOOLBOX_HEIGHT = 4 * (gateRadius*2 + 2) - gateRadius;

    var CIRCUIT_AREA = new Rect(0, TOOLBOX_HEIGHT + 2, canvas.width, 201);
    var STATE_DRAW_Y = CIRCUIT_AREA.bottom() + 2;
    var STATE_DRAW_H = canvas.height - STATE_DRAW_Y;

    var OPERATION_HINT_AREA = new Rect(
        0,
        STATE_DRAW_Y,
        STATE_DRAW_H,
        STATE_DRAW_H);

    var INTERMEDIATE_STATE_HINT_AREA = new Rect(
        OPERATION_HINT_AREA.right() + 5,
        STATE_DRAW_Y,
        STATE_DRAW_H,
        STATE_DRAW_H);

    var OUTPUT_STATE_HINT_AREA = new Rect(
        canvas.width - STATE_DRAW_H,
        STATE_DRAW_Y,
        STATE_DRAW_H,
        STATE_DRAW_H);

    var makeBitLabel = function(i) {
        if (i == 0) return "A1";
        if (i == 1) return "A2";
        if (i == 2) return "B1";
        if (i == 3) return "B2";
        return "bit" + i;
    }

// --- Math and Circuits ---
    /**
     * @param {Matrix} input
     * @param {GateColumn[]} operations
     * @returns {Matrix}
     */
    var transformVectorWithOperations = function (input, operations) {
        for (var i = 0; i < operations.length; i++) {
            input = operations[i].transform(input);
        }
        return input;
    };

// --- Define toolbox gate types ---
    var spinR = new Gate(
        "R(t)",
        Matrix.identity(2),
        "Evolving Rotation Gate",
        "A rotation gate where the angle of rotation increases and cycles over\n" +
        "time.");
    var spinH = new Gate(
        "H(t)",
        Matrix.identity(2),
        "Evolving Hadamard Gate",
        "Smoothly interpolates from no-op to the Hadamard gate and back over\n" +
        "time. A continuous rotation around the X+Z axis of the Block Sphere.");
    var spinX = new Gate(
        "X(t)",
        Matrix.identity(2),
        "Evolving X Gate",
        "Smoothly interpolates from no-op to the Pauli X gate and back over\n" +
        "time. A continuous rotation around the X axis of the Block Sphere.");
    var spinY = new Gate(
        "Y(t)",
        Matrix.identity(2),
        "Evolving Y Gate",
        "Smoothly interpolates from no-op to the Pauli Y gate and back over\n" +
        "time. A continuous rotation around the Y axis of the Block Sphere.");
    var spinZ = new Gate(
        "Z(t)",
        Matrix.identity(2),
        "Evolving Z Gate",
        "Smoothly interpolates from no-op to the Pauli Z gate and back over\n" +
        "time. A phase gate where the phase angle increases and cycles over\n" +
        "time. A continuous rotation around the Z axis of the Block Sphere.");
    /**
     * @type {{hint: string, gates: Gate[]}[]}
     */
    var gateSet = [
        {
            hint: "Special",
            gates: [
                Gate.CONTROL,
                Gate.PEEK,
                null,
                Gate.ANTI_CONTROL
            ]
        },
        {
            hint: "Half Turns",
            gates: [Gate.H, null, null, Gate.X, Gate.Y, Gate.Z]
        },
        {
            hint: "Quarter Turns (+/-)",
            gates: [
                Gate.DOWN,
                Gate.RIGHT,
                Gate.COUNTER_CLOCKWISE,
                Gate.UP,
                Gate.LEFT,
                Gate.CLOCKWISE]
        },
        {
            hint: "Evolving",
            gates: [spinX, spinY, spinZ, spinR, spinH]
        },
        {
            hint: "Other Z",
            gates: [
                Gate.fromRotation(0, 0, 1 / 3),
                Gate.fromRotation(0, 0, 1 / 8),
                Gate.fromRotation(0, 0, 1 / 16),
                Gate.fromRotation(0, 0, -1 / 3),
                Gate.fromRotation(0, 0, -1 / 8),
                Gate.fromRotation(0, 0, -1 / 16)
            ]
        }
    ];

// --- Layout Functions ---
    var wireIndexToY = function (i) {
        return CIRCUIT_AREA.y + (2 * i + 1) * CIRCUIT_AREA.h / numWires / 2;
    };
    var wireYToIndex = function (y) {
        var result = Math.round(((y - CIRCUIT_AREA.y) * 2 * numWires / CIRCUIT_AREA.h - 1) / 2);
        if (result < 0 || result >= numWires) return null;
        return result;
    };
    var operationIndexToX = function (index) {
        if (held !== null && held.col !== null) {
            if (index === held.col && circuitOperationColumns.length > 0) {
                index -= 0.5;
            }
            if (index > held.col) {
                index -= 1;
            }
        }
        var s = gateRadius * 2 + circuitOperationHorizontalSpacing;
        return s * (index + 1);
    };
    /**
     * @param {number} x
     * @param {number} y
     * @param {GateColumn[]} circuitCols
     * @returns {{ col : number, row : number, inExisting : boolean }}
     */
    var posToColumnIndexAndInsertSuggestion = function (x, y, circuitCols) {
        var s = gateRadius * 2 + circuitOperationHorizontalSpacing;
        var c = x / s - 0.5;
        var i = Math.floor(c);
        var j = wireYToIndex(y);
        if (j === null) {
            return null;
        }
        if (i < 0) {
            return {col: 0, row: j, inExisting: false};
        }
        if (i >= circuitCols.length) {
            return {col: i, row: j, inExisting: false};
        }

        var dc = c % 1;
        var isBefore = dc <= 0.3;
        var isAfter = dc >= 0.7;
        var isCentered = !isBefore && !isAfter;
        var isFree = circuitCols[i].gates[j] === null;
        if (isFree && isCentered) {
            return {col: i, row: j, inExisting: true};
        }

        var di = isAfter ? 1 : 0;
        return {col: i + di, row: j, inExisting: false};
    };

// --- State ---
    var latestMouseX = 0;
    var latestMouseY = 0;
    /**
     * @type {null|{ gate: Gate, col: (number|null), row: (number|null) }}
     */
    var held = null;
    var isTapping = false;
    var wasTapping = false;

    /**
     * @param {number} x
     * @param {number} y
     * @param {Gate} g
     */
    var drawFloatingGate = function (x, y, g) {
        var b = Rect.centeredSquareWithRadius(x, y, gateRadius);
        painter.fillRect(b, "orange");
        painter.strokeRect(b);
        drawGateSymbol(x, y, g);
    };

    /**
     * @param {number} x
     * @param {number} y
     * @param {Gate} g
     */
    var drawGateSymbol = function(x, y, g) {
        if (g.symbol === "\\∡") {
            painter.printCenteredText(g.symbol, x, y);
        } if (g.symbol === "\\⊹") {
            drawMatrix(Rect.centeredSquareWithRadius(x, y, gateRadius), g.matrix)
        } else if (g.symbol === "\\•") {
            var c = {x: x, y: y};
            var r = 5;
            if (g.matrix === Matrix.ANTI_CONTROL) {
                painter.fillCircle(c, r);
                painter.strokeCircle(c, r);
            } else {
                painter.fillCircle(c, r, "black");
            }
        } else {
            painter.printCenteredText(g.symbol, x, y);
        }
    };

    /**
     * @param {number} x
     * @param {number} y
     * @param {Gate} g
     */
    var drawToolboxGate = function (x, y, g) {
        var b = Rect.centeredSquareWithRadius(x, y, gateRadius);
        painter.fillRect(b);
        painter.strokeRect(b);
        drawGateSymbol(x, y, g);
    };

    /**
     * @param {number} x
     * @param {number} y
     * @param {Gate} g
     */
    var drawToolboxGateHintIfHovering = function (x, y, g) {
        var b = Rect.centeredSquareWithRadius(x, y, gateRadius);
        if (!b.containsPoint({x: latestMouseX, y: latestMouseY})) {
            return;
        }
        if (isTapping && !wasTapping) {
            held = {
                gate: g,
                row: null,
                col: null
            };
        }
        if (held === null) {
            var r = gateRadius;

            painter.fillRect(b, "orange");
            painter.strokeRect(b);

            var r2 = new Rect(50, y + r + 10, 400, (g.description.split("\n").length + 5) * 16 + 4 * r + 35);
            painter.fillRect(r2);
            painter.strokeRect(r2);
            painter.printText(
                g.name +
                "\n\n" +
                g.description +
                "\n\n" +
                "Transition Matrix (input chooses column(s)):\n" +
                "  if OFF   if ON\n" +
                "\n" +
                "                            OFF output\n" +
                "\n" +
                "\n" +
                "                            ON output\n" +
                "\n" +
                "\n" +
                g.matrix.toString(), 50 + 5, y + r + 25);
            drawMatrix(new Rect(55, y + r + 15 + (g.description.split("\n").length + 5) * 16, 4 * r, 4 * r), g.matrix);
        } else {
            painter.fillRect(b);
            painter.strokeRect(b);
        }
        drawGateSymbol(x, y, g);
    };

    /**
     * @param {GateColumn} gateColumn
     * @param {int} columnIndex
     */
    var drawColumnControlWires = function(gateColumn, columnIndex) {
        var nonNullGates = gateColumn.gates.filter(function(e) { return e !== null; });
        var controls = nonNullGates.filter(function(e) { return e.symbol === "\\•"; });

        var hasControls = controls.length > 0;
        var hasOthers = controls.length < nonNullGates.length;
        if (!hasControls || !hasOthers) {
            return;
        }

        var minIndex;
        var maxIndex;
        for (var i = 0; i < gateColumn.gates.length; i++) {
            if (gateColumn.gates[gateColumn.gates.length - 1 - i] !== null) {
                minIndex = gateColumn.gates.length - 1 - i;
            }
            if (gateColumn.gates[i] !== null) {
                maxIndex = i;
            }
        }
        var x = operationIndexToX(columnIndex);
        painter.strokeLine({x: x, y: wireIndexToY(minIndex)}, {x: x, y: wireIndexToY(maxIndex)});
    };

    /**
     * Returns the probability of controls on a column being satisfied and a wire being ON,
     * if that was measured.
     *
     * @param {GateColumn} gateColumn
     * @param {int} targetWire
     * @param {Matrix} columnState
     * @returns {{conditional: number, total: number, canDiffer: boolean}}
     */
    var measureGateColumnProbabilityOn = function (gateColumn, targetWire, columnState) {
        var expectedMask = 0;
        var requiredMask = 0;
        for (var i = 0; i < gateColumn.gates.length; i++) {
            if (gateColumn.gates[i] === Gate.CONTROL) {
                requiredMask |= 1 << i;
                expectedMask |= 1 << i;
            } else if (gateColumn.gates[i] === Gate.ANTI_CONTROL) {
                requiredMask |= 1 << i;
            }
        }
        return {
            conditional: measureConditionalProbability(targetWire, expectedMask, requiredMask, columnState),
            total: measureProbability(expectedMask | (1 << targetWire), requiredMask | (1 << targetWire), columnState),
            canDiffer: requiredMask != 0
        };
    };

    /**
     * @param {GateColumn} gateColumn
     * @param {int} columnIndex
     * @param {Matrix} columnState A complex column vector.
     */
    var drawCircuitOperation = function (gateColumn, columnIndex, columnState) {

        drawColumnControlWires(gateColumn, columnIndex);
        var x = operationIndexToX(columnIndex);

        for (var i = 0; i < gateColumn.gates.length; i++) {
            var cy = wireIndexToY(i);
            var b = Rect.centeredSquareWithRadius(x, cy, gateRadius);
            var gate = gateColumn.gates[i];
            if (gate === null) {
                continue;
            }

            var isHolding = held !== null && held.col === columnIndex && held.row === i;
            var canGrab = b.containsPoint({x: latestMouseX, y: latestMouseY}) && held === null && !isTapping;
            var didGrab = b.containsPoint({x: latestMouseX, y: latestMouseY}) && held === null && !wasTapping && isTapping;
            var highlightGate = isHolding || canGrab;
            var isNotControl = gate.symbol !== "\\•";
            var doDrawGateBox = isHolding || canGrab || isNotControl;
            if (doDrawGateBox) {
                painter.fillRect(b, highlightGate ? "orange" : "white");
                painter.strokeRect(b);
            }
            if (gate === Gate.PEEK) {
                var p = measureGateColumnProbabilityOn(gateColumn, i, columnState);
                drawProbabilityBox(b, p.conditional, p.total, p.canDiffer);
            } else {
                drawGateSymbol(x, cy, gate);
            }
            if (didGrab) {
                held = {gate: gate, col: null, row: null};
                circuitOperationColumns[columnIndex].gates[i] = null;
            }
        }
    };
    /**
     * @param {Matrix} inputState
     * @param {GateColumn[]} gateColumns
     */
    var drawCircuit = function (inputState, gateColumns) {
        for (var i = 0; i < numWires; i++) {
            var wireY = wireIndexToY(i);
            painter.printCenteredText(makeBitLabel(i) + ":", CIRCUIT_AREA.x + 14, wireY);
            painter.strokeLine({x: CIRCUIT_AREA.x + 30, y: wireY}, {x: CIRCUIT_AREA.x + canvas.width, y: wireY});
        }
        for (var i2 = 0; i2 < gateColumns.length; i2++) {
            inputState = gateColumns[i2].matrix().times(inputState);
            drawCircuitOperation(gateColumns[i2], i2, inputState);
        }
    };

    /**
     * @param {Rect} rect
     * @param {number} conditional_probability
     * @param {number} intersection_probability
     * @param {boolean} can_differ
     */
    var drawProbabilityBox = function (rect, conditional_probability, intersection_probability, can_differ) {
        painter.fillRect(rect);
        painter.strokeRect(rect);
        if (!can_differ) {
            var w = rect.w * conditional_probability;
            painter.fillRect(rect.takeLeft(w), "gray");
            painter.printCenteredText((conditional_probability*100).toFixed(1) + "%", rect.center().x, rect.center().y);
        } else {
            if (isNaN(conditional_probability)) {
                ctx.beginPath();
                ctx.moveTo(rect.x, rect.y);
                ctx.lineTo(rect.x + rect.w, rect.y + rect.h/2);
                ctx.lineTo(rect.x, rect.y + rect.h/2);
                ctx.lineTo(rect.x, rect.y);
                ctx.fillStyle = "gray";
                ctx.fill();
                painter.strokeLine(rect.topLeft(), rect.centerRight());
                painter.printText("|:N/A", rect.x + 2, rect.y + 15, undefined, 10);
            } else {
                var w1 = rect.w * conditional_probability;
                painter.fillRect(rect.topHalf().takeLeft(w1), "gray");
                painter.printText(" |:" + Math.round(conditional_probability*100) + "%", rect.x + 2, rect.y + 15, undefined, 10);
            }
            var w2 = rect.w * intersection_probability;
            painter.fillRect(rect.bottomHalf().takeLeft(w2), "gray");
            ctx.fillStyle = "black";
            ctx.fillText("∧:" + Math.round(intersection_probability*100) + "%", rect.x + 2, rect.y + rect.h/2 + 15);
        }
    };

    /**
     * @param {Rect} rect
     * @param {Matrix} matrix
     */
    var drawMatrix = function (rect, matrix) {
        var n = matrix.width();
        var w = rect.w / n;
        var h = rect.h / n;
        for (var i = 0; i < n; i++) {
            for (var j = 0; j < n; j++) {
                painter.paintAmplitude(matrix.rows[j][i], new Rect(rect.x + w * i, rect.y + h * j, w, h));
            }
        }

        // draw borders
        ctx.beginPath();
        var r = rect.x + rect.w;
        var b = rect.y + rect.h;
        for (var k = 0; k <= n; k++) {
            var x = rect.x + w * k;
            var y = rect.y + h * k;
            ctx.moveTo(rect.x, y);
            ctx.lineTo(r, y);
            ctx.moveTo(x, b);
            ctx.lineTo(x, rect.y);
        }
        ctx.strokeStyle = "black";
        ctx.stroke();
    };

    /**
     * @param {Rect} rect
     * @param {Matrix} values A column vector.
     */
    var drawState = function (rect, values) {
        // draw values
        var s = 1 << Math.ceil(numWires / 2);
        var dw = Math.floor(Math.min(rect.w, rect.h) / s);
        var dh = dw;
        for (var i = 0; i < values.height(); i++) {
            var dx = i % s;
            var dy = Math.floor(i / s);
            var x = rect.x + dw * dx;
            var y = rect.y + dh * dy;
            painter.paintAmplitude(values.rows[i][0], new Rect(x, y, dw, dh));
        }

        // draw borders
        painter.strokeGrid(new Rect(rect.x, rect.y, dw, dh), s, values.height() / s);
    };

    /**
     * Determines the probability of a wire or wires having particular values, given a quantum state.
     *
     * Note that wire probabilities are not independent in general. Wires may be correlated.
     *
     * @param {int} wireExpectedMask The bits of this number determine the desired wire values.
     * @param {int} wireRequiredMask The set bits of this number determine which wire values to check.
     * @param {Matrix} state A complex column vector.
     */
    var measureProbability = function(wireExpectedMask, wireRequiredMask, state) {
        var t = 0;
        for (var i = 0; i < state.height(); i++) {
            if ((i & wireRequiredMask) == (wireExpectedMask & wireRequiredMask)) {
                t += state.rows[i][0].norm2();
            }
        }
        return t;
    };

    /**
     * @param {int} wireTarget
     * @param {int} wireExpectedMask
     * @param {int} wireRequiredMask
     * @param {Matrix} state
     */
    var measureConditionalProbability = function(wireTarget, wireExpectedMask, wireRequiredMask, state) {
        var t_off = 0;
        var t_on = 0;
        for (var i = 0; i < state.height(); i++) {
            if ((i & wireRequiredMask) == (wireExpectedMask & wireRequiredMask)) {
                if ((i & (1 << wireTarget)) != 0) {
                    t_on += state.rows[i][0].norm2();
                } else {
                    t_off += state.rows[i][0].norm2();
                }
            }
        }
        return t_on / (t_off + t_on);
    };

    /**
     * @param {number} x
     * @param {Matrix} outputState
     */
    var drawSingleWireProbabilities = function (x, outputState) {
        for (var i = 0; i < numWires; i++) {
            var p = measureProbability(1 << i, 1 << i, outputState);
            drawProbabilityBox(Rect.centeredSquareWithRadius(x + 25, wireIndexToY(i), gateRadius), p, p, false);
        }
    };

    /**
     * @param {GateColumn[]} operations
     * @param {Rect} drawRect
     */
    var drawOutputAfter = function (operations, drawRect) {
        var input = makeInputVector();
        var output = transformVectorWithOperations(input, operations);
        drawSingleWireProbabilities(canvas.width - gateRadius*2 - 10, output);
        var gridRect = drawRect.skipLeft(14).skipTop(14);
        drawState(gridRect, output);
        painter.printCenteredText(makeBitLabel(0), gridRect.x + gridRect.w*1/4, drawRect.y + 8);
        painter.printCenteredText(makeBitLabel(1), gridRect.x + gridRect.w*2/4, drawRect.y + 6);
        painter.printCenteredText(makeBitLabel(0), gridRect.x + gridRect.w*3/4, drawRect.y + 8);
        painter.printCenteredText(makeBitLabel(2), drawRect.x + 6, gridRect.y + gridRect.h*1/4);
        painter.printCenteredText(makeBitLabel(3), drawRect.x + 4, gridRect.y + gridRect.h*2/4);
        painter.printCenteredText(makeBitLabel(2), drawRect.x + 6, gridRect.y + gridRect.h*3/4);
    };

    var drawGateSet = function () {
        var backRect = new Rect(0, 0, canvas.width, TOOLBOX_HEIGHT);
        painter.fillRect(backRect, "#CCC");
        painter.strokeRect(backRect);

        for (var i = 0; i < 2; i++) {
            for (var c = 0; c < gateSet.length; c++) {
                var col = gateSet[c];
                var x1 = c * (gateRadius * 4 + 22) + 50;
                var x2 = x1 + gateRadius * 2 + 2;
                if (i == 0) {
                    painter.printCenteredText(col.hint, (x1 + x2) / 2, 10);
                }

                for (var r = 0; r < col.gates.length; r++) {
                    if (col.gates[r] === null) continue;
                    var dx = Math.floor(r / 3);
                    var dy = r % 3;
                    var x = x1 + (gateRadius * 2 + 2) * dx;
                    var y = 18 + gateRadius + dy * (gateRadius * 2 + 2);
                    if (i == 0) {
                        drawToolboxGate(x, y, col.gates[r]);
                    } else {
                        drawToolboxGateHintIfHovering(x, y, col.gates[r]);
                    }
                }
            }
        }
    };

    var redraw = function () {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        var candidateNewCols = circuitOperationColumns.slice(0);
        for (var i = 0; i < candidateNewCols.length; i++) {
            candidateNewCols[i] = new GateColumn(candidateNewCols[i].gates.slice(0));
        }
        var insertSite = CIRCUIT_AREA.containsPoint({x: latestMouseX, y: latestMouseY})
            ? posToColumnIndexAndInsertSuggestion(latestMouseX, latestMouseY, candidateNewCols)
            : null;
        if (insertSite !== null && held === null && insertSite.col >= candidateNewCols.length) {
            insertSite = null;
        }

        // Add held operation into circuit
        if (insertSite !== null && held !== null) {
            if (!insertSite.inExisting) {
                while (candidateNewCols.length < insertSite.col) {
                    candidateNewCols.push(GateColumn.empty(numWires));
                }
                candidateNewCols.splice(insertSite.col, 0, GateColumn.empty(numWires));
                held.row = insertSite.row;
                held.col = insertSite.col;
            } else {
                held.row = null;
                held.col = null;
            }
            candidateNewCols[insertSite.col].gates[insertSite.row] = held.gate;
        }

        if (insertSite !== null && held === null) {
            var x1 = operationIndexToX(insertSite.col - 0.5);
            var x2 = operationIndexToX(insertSite.col + 0.5);
            ctx.fillStyle = held === null ? "yellow" : "orange";
            ctx.fillRect(x1, CIRCUIT_AREA.y, x2 - x1, CIRCUIT_AREA.h);
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.moveTo(x2, CIRCUIT_AREA.y);
            ctx.lineTo(x2, CIRCUIT_AREA.y + CIRCUIT_AREA.h);
            ctx.strokeStyle = "gray";
            ctx.stroke();
        }

        drawCircuit(makeInputVector(), candidateNewCols);

        if (insertSite !== null) {
            var m = candidateNewCols[insertSite.col].matrix();
            drawMatrix(OPERATION_HINT_AREA, m);

            drawOutputAfter(candidateNewCols.slice(0, insertSite.col + 1), INTERMEDIATE_STATE_HINT_AREA);
        }
        drawOutputAfter(candidateNewCols, OUTPUT_STATE_HINT_AREA);

        drawGateSet();

        if (held !== null && insertSite === null) {
            drawFloatingGate(latestMouseX, latestMouseY, held.gate);
        }

        if (insertSite !== null && held !== null && wasTapping && !isTapping) {
            circuitOperationColumns = candidateNewCols.filter(function(e) { return !e.isEmpty();});
        }
    };

    var mouseUpdate = function (p, pressed) {
        //noinspection JSUnresolvedFunction
        latestMouseX = p.pageX - $(canvas).position().left;
        //noinspection JSUnresolvedFunction
        latestMouseY = p.pageY - $(canvas).position().top;
        if (isTapping != pressed) {
            wasTapping = isTapping;
            isTapping = pressed;
        }
        redraw();

        if (!isTapping) {
            held = null;
        }
        if (isTapping != wasTapping) {
            wasTapping = isTapping;
            redraw();
        }
    };
    //noinspection JSUnresolvedFunction
    $(canvas).mousedown(function (p) {
        if (p.which != 1) return;
        mouseUpdate(p, true);
    });
    //noinspection JSUnresolvedFunction
    $(document).mouseup(function (p) {
        if (p.which != 1) return;
        mouseUpdate(p, false);
    });
    //noinspection JSUnresolvedFunction
    $(document).mousemove(function (p) {
        if (isTapping) {
            mouseUpdate(p, isTapping);
        }
    });
    //noinspection JSUnresolvedFunction
    $(canvas).mousemove(function (p) {
        if (!isTapping) {
            mouseUpdate(p, isTapping);
        }
    });
    //noinspection JSUnresolvedFunction
    $(canvas).mouseleave(function () {
        mouseUpdate({offsetX: -100, offsetY: -100}, isTapping);
    });

    var ts = 0;
    /**
     * @returns {Matrix}
     */
    var makeInputVector = function () {
        return Matrix.col([1, 0]).tensorPower(numWires);
    };

    setInterval(function() {
        ts += 0.05;
        ts %= 2 * Math.PI;
        var u = ts / 2 / Math.PI;
        var u2 = u / Math.sqrt(2);
        var c = Math.cos(ts);
        var s = Math.sin(ts);

        spinR.matrix = Matrix.square([c, -s, s, c]);
        spinX.matrix = Matrix.fromRotation(u, 0, 0);
        spinY.matrix = Matrix.fromRotation(0, u, 0);
        spinZ.matrix = Matrix.fromRotation(0, 0, u);
        spinH.matrix = Matrix.fromRotation(u2, 0, u2);
        redraw();
    }, 50);
    redraw();
}
