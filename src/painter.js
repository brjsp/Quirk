// ===================================
//      CONFIGURATION CONSTANTS
// ===================================
var AMPLITUDE_CIRCLE_FILL_COLOR_TYPICAL = "yellow";
var AMPLITUDE_CIRCLE_FILL_COLOR_WHEN_CONTROL_FORCES_VALUE_TO_ONE = "#201000";
var AMPLITUDE_CIRCLE_STROKE_COLOR = "gray";
var AMPLITUDE_CLEAR_COLOR_WHEN_CONTROL_FORCES_VALUE_TO_ZERO = "#444";
var AMPLITUDE_PROBABILITY_FILL_UP_COLOR = "orange";

/**
 * @param {CanvasRenderingContext2D} ctx
 * @constructor
 */
function Painter(ctx) {
    this.ctx = ctx;
}

/**
 * Draws the inside of a rectangle.
 * @param {Rect} rect The rectangular area to fill.
 * @param {=string} color The fill color. Defaults to black.
 */
Painter.prototype.fillRect = function (rect, color) {
    this.ctx.fillStyle = color || "white";
    this.ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
};

/**
 * Draws the outside of a rectangle.
 * @param {Rect} rect The rectangular perimeter to stroke.
 * @param {=string} color The stroke color. Defaults to black.
 * @param {=number} thickness The stroke thickness. Defaults to 1.
 */
Painter.prototype.strokeRect = function (rect, color, thickness) {
    this.ctx.strokeStyle = color || "black";
    this.ctx.strokeWidth = thickness || 1;
    this.ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
};

/**
 * Draws the inside of a circle.
 * @param {{x: number, y: number}} center The center of the circle.
 * @param radius The distance from the center of the circle to its side.
 * @param {=string} color The fill color. Defaults to white.
 */
Painter.prototype.fillCircle = function (center, radius, color) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color || "white";
    ctx.fill();
};

/**
 * Draws the outside of a circle.
 * @param {{x: number, y: number}} center The center of the circle.
 * @param radius The distance from the center of the circle to its side.
 * @param {=string} color The stroke color. Defaults to black.
 * @param {=number} thickness The stroke thickness. Defaults to 1.
 */
Painter.prototype.strokeCircle = function (center, radius, color, thickness) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = color || "black";
    ctx.strokeWidth = thickness || 1;
    ctx.stroke();
};

/**
 * Draws a string. Handles multi-line strings.
 *
 * @param {string} text The string to draw.
 * @param {number} x The left position of the drawn string.
 * @param {number} y The top position of the drawn string.
 * @param {=string} fontColor The text color. Defaults to black.
 * @param {=number} fontSize The text size. Defaults to 12px.
 * @param {=string} fontFamily The text font family. Defaults to Helvetica.
 */
Painter.prototype.printText = function (text, x, y, fontColor, fontSize, fontFamily) {
    fontSize = fontSize || 12;
    fontColor = fontColor || "black";
    fontFamily = fontFamily || "Helvetica";

    this.ctx.fillStyle = fontColor;
    this.ctx.font = fontSize + "px " + fontFamily;

    var lines = text.split("\n");
    for (var i = 0; i < lines.length; i++) {
        this.ctx.fillText(lines[i], x, y + (i*4*fontSize)/3);
    }
};

/**
 * Draws a string centered around the given point. Does NOT handle multi-line strings.
 *
 * @param text The string to draw.
 * @param x The x coordinate of the center position of the drawn string.
 * @param y The y coordinate of the center position of the drawn string.
 * @param {=string} fontColor The text color. Defaults to black.
 * @param {=number} fontSize The text size. Defaults to 12px.
 * @param {=string} fontFamily The text font family. Defaults to Helvetica.
 */
Painter.prototype.printCenteredText = function (text, x, y, fontColor, fontSize, fontFamily) {
    fontSize = fontSize || 12;
    fontColor = fontColor || "black";
    fontFamily = fontFamily || "Helvetica";

    this.ctx.fillStyle = fontColor;
    this.ctx.font = fontSize + "px " + fontFamily;
    var s = this.ctx.measureText(text);

    this.ctx.fillText(text, x - s.width / 2, y + fontSize/3);
};

/**
 * Draws a line segment between the two points.
 *
 * @param {{x: number, y: number}} p1
 * @param {{x: number, y: number}} p2
 * @param {=string} color The color of the drawn line. Defaults to black.
 * @param {=number} thickness The thickness of the drawn line. Defaults to 1.
 */
Painter.prototype.strokeLine = function(p1, p2, color, thickness) {
    this.ctx.beginPath();
    this.ctx.moveTo(p1.x, p1.y);
    this.ctx.lineTo(p2.x, p2.y);
    this.ctx.strokeStyle = color || "black";
    this.ctx.strokeWidth = thickness || 1;
    this.ctx.stroke();
};

/**
 * Draws representations of complex values used to weight components of a superposition.
 *
 * @param {Rect} area The drawing area, where the amplitude will be represented visually.
 * @param {Complex} amplitude The complex value to represent visually. Its magnitude should be at most 1.
 */
Painter.prototype.paintAmplitude = function(amplitude, area) {
    if (amplitude === Matrix.__TENSOR_SYGIL_COMPLEX_ZERO) {
        painter.fillRect(area, AMPLITUDE_CLEAR_COLOR_WHEN_CONTROL_FORCES_VALUE_TO_ZERO);
        return;
    }

    var c = area.center();
    var magnitude = amplitude.abs();
    var p = amplitude.norm2();
    var d = Math.min(area.w, area.h) / 2;
    var r = d * magnitude;
    var dx = d * amplitude.real;
    var dy = d * amplitude.imag;
    var isControl = amplitude === Matrix.__TENSOR_SYGIL_COMPLEX_CONTROL_ONE;

    if (magnitude <= 0.0001) {
        return; // Even showing a tiny dot is too much.
    }

    // fill rect from bottom to top as the amplitude becomes more probable
    painter.fillRect(area.takeBottom(p * area.h), AMPLITUDE_PROBABILITY_FILL_UP_COLOR);

    // show the direction and magnitude as a circle with a line indicator
    painter.fillCircle(c, r, isControl
        ? AMPLITUDE_CIRCLE_FILL_COLOR_WHEN_CONTROL_FORCES_VALUE_TO_ONE
        : AMPLITUDE_CIRCLE_FILL_COLOR_TYPICAL);
    painter.strokeCircle(c, r, AMPLITUDE_CIRCLE_STROKE_COLOR);
    painter.strokeLine(c, {x: c.x + dx, y: c.y - dy});

    // cross out (in addition to the darkening) when controlled
    if (isControl) {
        painter.strokeLine(area.topLeft(), area.bottomRight());
    }
};

/**
 * Draws a grid.
 * @param {Rect} topLeftCell
 * @param {number} cols
 * @param {number} rows
 * @param {=string} strokeColor
 * @param {=number} strokeThickness
 */
Painter.prototype.strokeGrid = function(topLeftCell, cols, rows, strokeColor, strokeThickness) {
    var x = topLeftCell.x;
    var y = topLeftCell.y;
    var dw = topLeftCell.w;
    var dh = topLeftCell.h;
    var x2 = x + cols*dw;
    var y2 = y + rows*dh;
    this.ctx.beginPath();
    for (var c = 0; c <= rows; c++) {
        this.ctx.moveTo(x + c*dw, y);
        this.ctx.lineTo(x + c*dw, y2);
    }
    for (var r = 0; r <= rows; r++) {
        this.ctx.moveTo(x, y + r*dh);
        this.ctx.lineTo(x2, y + r*dh);
    }

    this.ctx.strokeStyle = strokeColor || "black";
    this.ctx.strokeWidth = strokeThickness || 1;
    this.ctx.stroke();
};
