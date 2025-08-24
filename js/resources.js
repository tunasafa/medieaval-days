// Resource-related Functions
function updateResourceRates() {
    gameState.resourceRates = { food: 0, wood: 0, stone: 0, gold: 0 };
    gameState.units.forEach(unit => {
        if (unit.state === 'gathering' && unit.gatherType && unit.gatheredAmount > 0) {
            const config = GAME_CONFIG.units[unit.type];
            gameState.resourceRates[unit.gatherType] += config.gatherRate;
        } else if (unit.type === 'fishingBoat' && unit.state === 'fishing') {
            const config = GAME_CONFIG.units[unit.type];
            gameState.resourceRates.food += (config.gatherRate || 2.5);
        }
    });
    document.getElementById('food-rate').textContent = gameState.resourceRates.food.toFixed(1);
    document.getElementById('wood-rate').textContent = gameState.resourceRates.wood.toFixed(1);
    document.getElementById('stone-rate').textContent = gameState.resourceRates.stone.toFixed(1);
    document.getElementById('gold-rate').textContent = gameState.resourceRates.gold.toFixed(1);
}

function findNearestResource(unit, resourceType) {
     let closest = null;
     let closestDist = Infinity;
     gameState.worldObjects.forEach(obj => {
         if (obj.type === 'resource' && obj.resourceType === resourceType && obj.amount > 0) {
             const dist = getDistance(unit, {x: obj.x + obj.width/2, y: obj.y + obj.height/2});
             if (dist < closestDist) {
                 closestDist = dist;
                 closest = obj;
             }
         }
     });
     return closest;
}