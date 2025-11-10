/**
 * Determines if a point is within any water body defined in the game state.
 * @param {number} x - The x-coordinate to check.
 * @param {number} y - The y-coordinate to check.
 * @returns {boolean} - True if the point is in water, false otherwise.
 */
function isPointInWater(x, y) {
    return gameState.worldObjects.some(obj => obj.type === 'water' &&
        x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height);
}

/**
 * Checks if a given point is on a bridge.
 * @param {number} x - The x-coordinate of the point.
 * @param {number} y - The y-coordinate of the point.
 * @returns {boolean} True if the point is on a bridge, otherwise false.
 */
function isPointOnBridge(x, y) {
    return gameState.worldObjects.some(obj => obj.type === 'bridge' &&
        x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height);
}

/**
 * Simple Line-Of-Sight (LOS) check for a specific unit using terrain validation.
 * @param {number} x0 - The starting x-coordinate.
 * @param {number} y0 - The starting y-coordinate.
 * @param {number} x1 - The ending x-coordinate.
 * @param {number} y1 - The ending y-coordinate.
 * @param {Object} unit - The unit for which to check LOS, used for terrain validation.
 * @returns {boolean} - True if there is a clear line of sight, false otherwise.
 */
function hasLOSForUnit(x0, y0, x1, y1, unit) {
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return true;
    const step = 8; // Sample every 8 pixels
    const steps = Math.max(2, Math.ceil(dist / step));
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const sx = x0 + dx * t;
        const sy = y0 + dy * t;
        // The validateTerrainMovement function is assumed to be globally available
        // and should handle the specific movement rules for the unit.
        if (!validateTerrainMovement(unit, sx, sy)) return false;
    }
    return true;
}
