// Initialize Matter.js
const Engine = Matter.Engine,
      Render = Matter.Render,
      Runner = Matter.Runner,
      Bodies = Matter.Bodies,
      Body = Matter.Body,
      Composite = Matter.Composite,
      Constraint = Matter.Constraint,
      Events = Matter.Events,
      Vector = Matter.Vector;

// Game constants
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 600;
const GRAVITY = 0.25;
const THRUST_FORCE = 0.004;
const ROTATION_FORCE = 0.0011;
const FUEL_CONSUMPTION_RATE = 0.3;
const INITIAL_FUEL = 500;
const MAX_SPEED = 4;
const BASE_CATCH_ARM_WIDTH = 60; // Base width for difficulty level 1

// Game state
let engine;
let rocket;
let centerChopstick;
let rightCatchArm;  // Right catch arm only
let rocketCatchConstraint; // Constraint to attach rocket to catch arm (right point)
let rocketCatchConstraint2; // Constraint for the left catch point
let gameActive = false;
let fuel = INITIAL_FUEL;
let score = 0;
let gameOverMessage = '';
let thrusterActive = false;
let difficultyLevel = 1; // Start at level 1
let successfulLandings = 0; // Count successful landings
let animationFrameId = null; // Track the animation frame ID
let throttleLevel = 0; // Current throttle level (0-100%)
let throttleChangeRate = 1.1; // How fast throttle changes per frame (percentage points)
let alignmentStartTime = 0; // Time when alignment started
let alignmentDuration = 0; // How long the rocket has been aligned
const REQUIRED_ALIGNMENT_DURATION = 30; // Frames required to maintain alignment (about 1 second at 60fps)

// FPS tracking variables
let lastFrameTime = performance.now();
let frameCount = 0;
let lastFpsUpdate = performance.now();
let currentFps = 0;
const fpsUpdateInterval = 500; // Update FPS display every 500ms

// UI elements
const fuelDisplay = document.getElementById('fuel');
const velocityDisplay = document.getElementById('velocity');
const thrustDisplay = document.getElementById('thrust');
const scoreDisplay = document.getElementById('score');
const gameOverElement = document.getElementById('gameOver');
const gameOverMessageElement = document.getElementById('gameOverMessage');
const finalScoreElement = document.getElementById('finalScore');
const restartButton = document.getElementById('restartButton');
const canvas = document.getElementById('gameCanvas');
const alignmentStatusDisplay = document.getElementById('alignment-status');
const fpsDisplay = document.getElementById('fps');
// Add debug display element
const debugDisplayElement = document.getElementById('debug-values') || document.createElement('div');
if (!debugDisplayElement.id) {
    debugDisplayElement.id = 'debug-values';
    debugDisplayElement.style.position = 'absolute';
    debugDisplayElement.style.top = '120px';
    debugDisplayElement.style.left = '10px';
    debugDisplayElement.style.color = '#ffffff';
    debugDisplayElement.style.fontFamily = 'monospace';
    debugDisplayElement.style.fontSize = '12px';
    debugDisplayElement.style.textAlign = 'left';
    debugDisplayElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    debugDisplayElement.style.padding = '5px';
    debugDisplayElement.style.borderRadius = '5px';
    debugDisplayElement.style.zIndex = '1000';
    document.body.appendChild(debugDisplayElement);
}

// Initialize the game
function init() {
    // Create engine
    engine = Engine.create({
        gravity: {
            x: 0,
            y: GRAVITY
        }
    });

    // Setup renderer
    const render = Render.create({
        canvas: canvas,
        engine: engine,
        options: {
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            wireframes: false,
            background: '#000',
            showAngleIndicator: false
        }
    });

    // Create rocket (more detailed with catch points)
    const rocketBody = Bodies.rectangle(CANVAS_WIDTH / 2, 50, 14, 70, {
        density: 0.01,
        frictionAir: 0.012,
        restitution: 0.15,
        render: {
            fillStyle: '#e0e0e0',
            strokeStyle: '#aaaaaa',
            lineWidth: 1
        }
    });
    
    // Add rocket catch points (these are visual only)
    const catchPointsRadius = 4;
    const rocketHeight = 70;
    
    // The main rocket body is our physics object
    rocket = rocketBody;

    // Create Mechazilla tower and catch arms
    const padY = CANVAS_HEIGHT - 20;
    const padWidth = 150;
    const chopstickHeight = 160; // Make it taller since there's no landing pad
    const catchArmWidth = calculateCatchArmWidth(); // Dynamic width based on difficulty
    const catchArmHeight = 8;
    const catchPointY = padY - chopstickHeight + 30; // Position for the catch arms
    
    // Create a solid base for the Mechazilla tower
    const baseWidth = 60;
    const baseHeight = 20;
    const towerBase = Bodies.rectangle(
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT - baseHeight/2,
        baseWidth,
        baseHeight,
        { isStatic: true, render: { fillStyle: '#555555' } }
    );
    
    // Center tower (Mechazilla)
    centerChopstick = Bodies.rectangle(
        CANVAS_WIDTH / 2, 
        padY - chopstickHeight / 2, 
        10,
        chopstickHeight, 
        { isStatic: true, render: { fillStyle: '#666666' } }
    );
    
    // Only right catch arm
    rightCatchArm = Bodies.rectangle(
        CANVAS_WIDTH / 2 + catchArmWidth / 2 + 5, 
        catchPointY,
        catchArmWidth,
        catchArmHeight,
        { 
            isStatic: true, 
            render: { 
                fillStyle: '#888888', 
                strokeStyle: difficultyLevel === 1 ? '#ff3300' : 
                             difficultyLevel === 2 ? '#ff6600' : 
                             difficultyLevel === 3 ? '#ff9900' : 
                             difficultyLevel === 4 ? '#ffcc00' : '#ffff00',
                lineWidth: 2 
            },
            collisionFilter: {
                group: -1,  // Negative group means it won't collide with anything
                category: 0x0002,
                mask: 0x0000  // Won't collide with any category
            }
        }
    );

    // Add bodies to the world (no landing pad and only right catch arm)
    Composite.add(engine.world, [rocket, centerChopstick, rightCatchArm, towerBase]);

    // Add invisible floor to catch failed landings
    const floor = Bodies.rectangle(
        CANVAS_WIDTH / 2, 
        CANVAS_HEIGHT + 25,  // Below the visible area
        CANVAS_WIDTH * 2, 
        50, 
        { isStatic: true, render: { visible: false } }
    );
    
    // Add walls to keep the rocket within bounds
    const walls = [
        Bodies.rectangle(CANVAS_WIDTH / 2, -10, CANVAS_WIDTH, 20, { isStatic: true }), // top
        floor, // invisible floor at the bottom
        Bodies.rectangle(-10, CANVAS_HEIGHT / 2, 20, CANVAS_HEIGHT, { isStatic: true }), // left
        Bodies.rectangle(CANVAS_WIDTH + 10, CANVAS_HEIGHT / 2, 20, CANVAS_HEIGHT, { isStatic: true }) // right
    ];
    Composite.add(engine.world, walls);

    // Start the engine and renderer
    Render.run(render);
    Runner.run(engine);

    // Set up collision detection
    setupCollisionDetection();

    // Reset game state
    resetGame();
    gameActive = true;
}

// Handle keyboard controls
const keys = {};
let lastLandingTime = 0; // Add timestamp for last landing attempt

document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    
    // Handle space key press
    if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault(); // Prevent page scrolling
        
        // If game is active, attempt landing
        if (gameActive) {
            attemptLanding();
            lastLandingTime = Date.now(); // Record when landing was attempted
        } 
        // Only allow restart if game is not active AND it's been at least 500ms since landing
        else if (!gameActive && Date.now() - lastLandingTime > 500) {
            resetGame();
            animationFrameId = requestAnimationFrame(gameLoop);
        }
    }
});
document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Game loop
function gameLoop() {
    // Calculate FPS
    const currentTime = performance.now();
    frameCount++;
    
    // Update FPS display every 500ms
    if (currentTime - lastFpsUpdate >= fpsUpdateInterval) {
        currentFps = Math.round((frameCount * 1000) / (currentTime - lastFpsUpdate));
        fpsDisplay.textContent = `FPS: ${currentFps}`;
        frameCount = 0;
        lastFpsUpdate = currentTime;
    }
    
    lastFrameTime = currentTime;

    // Always draw the rocket with catch points, even when game is over
    drawRocketWithCatchPoints();
    
    if (!gameActive) {
        // Continue the animation loop even when game is over
        animationFrameId = requestAnimationFrame(gameLoop);
        return;
    }

    // Apply speed limit to prevent extreme velocities
    limitRocketSpeed();
    
    // Check for successful alignment landing when game is active
    checkForAlignmentLanding();

    // Handle throttle dynamics
    if (keys['ArrowUp'] && fuel > 0) {
        // Gradually increase throttle when up arrow is pressed
        throttleLevel = Math.min(100, throttleLevel + throttleChangeRate);
        thrusterActive = true;
    } else {
        // Gradually decrease throttle when up arrow is released
        throttleLevel = Math.max(0, throttleLevel - throttleChangeRate * 1.5);
        thrusterActive = throttleLevel > 5; // Still show visual effects for low throttle
    }
    
    // Apply thrust based on current throttle level
    if (throttleLevel > 0 && fuel > 0) {
        // Scale thrust force by current throttle percentage
        const throttlePercent = throttleLevel / 100;
        
        // Calculate thrust - slightly stronger when falling fast
        let appliedThrust = THRUST_FORCE * throttlePercent;
        if (rocket.velocity.y > 2) {
            appliedThrust = appliedThrust * 1.3;
        }
        
        const thrustVector = Vector.rotate(
            { x: 0, y: -appliedThrust },
            rocket.angle
        );
        Body.applyForce(rocket, rocket.position, thrustVector);
        
        // Consume fuel based on throttle level
        const fuelConsumptionRate = FUEL_CONSUMPTION_RATE * (throttlePercent * 0.8 + 0.2);
        fuel = Math.max(0, fuel - fuelConsumptionRate);
        fuelDisplay.textContent = `Fuel: ${Math.round(fuel)}%`;

        // Draw thruster flame (visual effect) - size based on throttle
        const ctx = canvas.getContext('2d');
        const rocketPos = rocket.position;
        const rocketAngle = rocket.angle;
        
        // Use the rocket's angle to position the thruster flame
        const flameLength = (10 + Math.random() * 5) * (0.5 + throttlePercent * 0.5); // Variable flame length based on throttle
        const thrusterX = rocketPos.x - Math.sin(rocketAngle) * 35;
        const thrusterY = rocketPos.y + Math.cos(rocketAngle) * 35;
        
        ctx.save();
        ctx.translate(thrusterX, thrusterY);
        ctx.rotate(rocketAngle);
        
        // Draw flame
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-8, flameLength);
        ctx.lineTo(8, flameLength);
        ctx.closePath();
        
        // Create gradient for flame
        const gradient = ctx.createLinearGradient(0, 0, 0, flameLength);
        gradient.addColorStop(0, '#ff9500');
        gradient.addColorStop(1, '#ff2d00');
        ctx.fillStyle = gradient;
        ctx.fill();
        
        ctx.restore();
    }

    // Rotation control (left/right arrows)
    if (keys['ArrowLeft'] && fuel > 0) {
        Body.setAngularVelocity(rocket, rocket.angularVelocity - ROTATION_FORCE);
        fuel = Math.max(0, fuel - FUEL_CONSUMPTION_RATE / 4);
    }
    if (keys['ArrowRight'] && fuel > 0) {
        Body.setAngularVelocity(rocket, rocket.angularVelocity + ROTATION_FORCE);
        fuel = Math.max(0, fuel - FUEL_CONSUMPTION_RATE / 4);
    }

    // Apply dampening to angular velocity for smoother rotation
    Body.setAngularVelocity(rocket, rocket.angularVelocity * 0.95);

    // Update velocity display
    const velocity = Math.sqrt(
        rocket.velocity.x * rocket.velocity.x + 
        rocket.velocity.y * rocket.velocity.y
    );
    velocityDisplay.textContent = `Velocity: ${velocity.toFixed(2)} m/s`;
    
    // Update thrust display
    thrustDisplay.textContent = `Thrust: ${Math.round(throttleLevel)}%`;

    animationFrameId = requestAnimationFrame(gameLoop);
}

// Limit rocket speed to prevent extreme velocities
function limitRocketSpeed() {
    const velocity = rocket.velocity;
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
    
    if (speed > MAX_SPEED) {
        const ratio = MAX_SPEED / speed;
        Body.setVelocity(rocket, {
            x: velocity.x * ratio,
            y: velocity.y * ratio
        });
    }
}

// Attempt landing when space is pressed
function attemptLanding() {
    // If no rocket or tower, or game not active, exit early
    if (!rocket || !rightCatchArm || !gameActive) return;
    
    // Calculate rocket's velocity
    const landingVelocity = Math.sqrt(
        rocket.velocity.x * rocket.velocity.x + 
        rocket.velocity.y * rocket.velocity.y
    );
    
    // Check if rocket is upright
    const isUprightLanding = Math.abs(rocket.angle % (2 * Math.PI)) < 0.35 || 
                             Math.abs(rocket.angle % (2 * Math.PI) - 2 * Math.PI) < 0.35;
    
    // Calculate the position of the rocket's right catch point in world coordinates
    const catchPointY = -35 + 15; // Relative to rocket center (-35 is half height, +15 is catch point offset)
    const catchPointX = 7 + 2;   // Half width (7 = 14/2) + catch point offset
    
    // Transform the catch point position based on rocket's position and angle
    const rotatedX = Math.cos(rocket.angle) * catchPointX - Math.sin(rocket.angle) * catchPointY;
    const rotatedY = Math.sin(rocket.angle) * catchPointX + Math.cos(rocket.angle) * catchPointY;
    
    const worldCatchPointX = rocket.position.x + rotatedX;
    const worldCatchPointY = rocket.position.y + rotatedY;
    
    // Check distance to the right catch arm
    const horizontalDistance = Math.abs(worldCatchPointX - rightCatchArm.position.x);
    const verticalDistance = Math.abs(worldCatchPointY - rightCatchArm.position.y);
    
    // More forgiving alignment tolerance based on catch arm width
    // Horizontal tolerance is half the catch arm width
    const horizontalTolerance = rightCatchArm.bounds.max.x - rightCatchArm.bounds.min.x;
    const isAligned = horizontalDistance < (horizontalTolerance / 2) && verticalDistance < 12;
    
    // Check if the rocket is properly positioned - slow velocity, upright, and aligned
    const isWellPositioned = landingVelocity < 3 && isUprightLanding && isAligned;
    
    if (isWellPositioned) {
        // Perfect mechazilla alignment - mission successful!
        score += 2000;
        gameOverMessage = 'Perfect Mechazilla Catch!';
        
        // Add velocity bonus for successful landings
        if (landingVelocity < 1.2) {
            score += 300;
        } else if (landingVelocity < 1.8) {
            score += 150;
        }
        
        // Add fuel bonus
        score += Math.round(fuel) * 2;
        
        // Attach the rocket to the catch arm
        attachRocketToCatchArm();
        
        endGame();
    } else {
        // Different failure messages based on what went wrong
        if (!isUprightLanding) {
            gameOverMessage = 'Landing Failed: Not Upright!';
        } else if (landingVelocity >= 3) {
            gameOverMessage = 'Landing Failed: Too Fast!';
        } else if (!isAligned) {
            gameOverMessage = 'Landing Failed: Not Aligned!';
        }
        endGame();
    }
}

// Check if the rocket is properly aligned with the catch arm
function checkForAlignmentLanding() {
    // If no rocket or tower, or game not active, exit early
    if (!rocket || !rightCatchArm || !gameActive) return;
    
    // Calculate rocket's velocity
    const landingVelocity = Math.sqrt(
        rocket.velocity.x * rocket.velocity.x + 
        rocket.velocity.y * rocket.velocity.y
    );
    
    // Check if rocket is upright
    const isUprightLanding = Math.abs(rocket.angle % (2 * Math.PI)) < 0.35 || 
                             Math.abs(rocket.angle % (2 * Math.PI) - 2 * Math.PI) < 0.35;
    
    // Calculate the position of the rocket's right catch point in world coordinates
    const catchPointY = -35 + 15; // Relative to rocket center (-35 is half height, +15 is catch point offset)
    const catchPointX = 7 + 2;   // Half width (7 = 14/2) + catch point offset
    
    // Transform the catch point position based on rocket's position and angle
    const rotatedX = Math.cos(rocket.angle) * catchPointX - Math.sin(rocket.angle) * catchPointY;
    const rotatedY = Math.sin(rocket.angle) * catchPointX + Math.cos(rocket.angle) * catchPointY;
    
    const worldCatchPointX = rocket.position.x + rotatedX;
    const worldCatchPointY = rocket.position.y + rotatedY;
    
    // Check distance to the right catch arm
    const horizontalDistance = Math.abs(worldCatchPointX - rightCatchArm.position.x);
    const verticalDistance = Math.abs(worldCatchPointY - rightCatchArm.position.y);
    
    // More forgiving alignment tolerance based on catch arm width
    // Horizontal tolerance is half the catch arm width
    const horizontalTolerance = rightCatchArm.bounds.max.x - rightCatchArm.bounds.min.x;
    const isAligned = horizontalDistance < (horizontalTolerance / 2) && verticalDistance < 12;
    
    // Check if the rocket is properly positioned - slow velocity, upright, and aligned
    const isWellPositioned = landingVelocity < 3 && isUprightLanding && isAligned;
    
    // Update debug display with alignment variables
    const rocketAngleDegrees = (rocket.angle * 180 / Math.PI) % 360;
    debugDisplayElement.innerHTML = `
        <strong>DEBUG ALIGNMENT:</strong><br>
        Angle: ${rocketAngleDegrees.toFixed(2)}° ${isUprightLanding ? '✓' : '✗'}<br>
        Horiz Dist: ${horizontalDistance.toFixed(2)}px (max ${(horizontalTolerance/2).toFixed(2)}) ${horizontalDistance < (horizontalTolerance/2) ? '✓' : '✗'}<br>
        Vert Dist: ${verticalDistance.toFixed(2)}px (max 12) ${verticalDistance < 12 ? '✓' : '✗'}<br>
        Velocity: ${landingVelocity.toFixed(2)} (max 3) ${landingVelocity < 3 ? '✓' : '✗'}<br>
        Catch Point: (${worldCatchPointX.toFixed(0)}, ${worldCatchPointY.toFixed(0)})<br>
        Catch Arm: (${rightCatchArm.position.x.toFixed(0)}, ${rightCatchArm.position.y.toFixed(0)})<br>
        Well Positioned: ${isWellPositioned ? 'YES ✓ (Press SPACE to land!)' : 'NO ✗'}<br>
    `;
    
    // Update alignment status display
    if (!isUprightLanding) {
        alignmentStatusDisplay.textContent = 'Status: Not upright (Need to be vertical)';
        alignmentStatusDisplay.style.color = '#ff3300';
        // Reset catch arm color
        rightCatchArm.render.strokeStyle = difficultyLevel === 1 ? '#ff3300' : 
                                         difficultyLevel === 2 ? '#ff6600' : 
                                         difficultyLevel === 3 ? '#ff9900' : 
                                         difficultyLevel === 4 ? '#ffcc00' : '#ffff00';
    } else if (landingVelocity >= 3) {
        alignmentStatusDisplay.textContent = 'Status: Too fast (Slow down)';
        alignmentStatusDisplay.style.color = '#ff3300';
        // Reset catch arm color
        rightCatchArm.render.strokeStyle = difficultyLevel === 1 ? '#ff3300' : 
                                         difficultyLevel === 2 ? '#ff6600' : 
                                         difficultyLevel === 3 ? '#ff9900' : 
                                         difficultyLevel === 4 ? '#ffcc00' : '#ffff00';
    } else if (!isAligned) {
        alignmentStatusDisplay.textContent = 'Status: Not aligned with catch arm';
        alignmentStatusDisplay.style.color = '#ff3300';
        // Reset catch arm color
        rightCatchArm.render.strokeStyle = difficultyLevel === 1 ? '#ff3300' : 
                                         difficultyLevel === 2 ? '#ff6600' : 
                                         difficultyLevel === 3 ? '#ff9900' : 
                                         difficultyLevel === 4 ? '#ffcc00' : '#ffff00';
    } else {
        alignmentStatusDisplay.textContent = '✨ PRESS SPACE TO ATTEMPT LANDING! ✨';
        alignmentStatusDisplay.style.color = '#00ff00';
        // Show solid green when ready to land
        rightCatchArm.render.strokeStyle = '#00ff00';
    }
}

// Set up collision detection - only for tower and ground now
function setupCollisionDetection() {
    Events.on(engine, 'collisionStart', (event) => {
        const pairs = event.pairs;
        
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i];
            
            // Check if rocket has collided with tower or ground
            if ((pair.bodyA === rocket || pair.bodyB === rocket)) {
                const otherBody = pair.bodyA === rocket ? pair.bodyB : pair.bodyA;
                
                // Calculate landing conditions
                const landingVelocity = Math.sqrt(
                    rocket.velocity.x * rocket.velocity.x + 
                    rocket.velocity.y * rocket.velocity.y
                );
                
                // Check if rocket is upright
                const isUprightLanding = Math.abs(rocket.angle % (2 * Math.PI)) < 0.35 || 
                                         Math.abs(rocket.angle % (2 * Math.PI) - 2 * Math.PI) < 0.35;
                
                // Check if tower was hit
                const hitTower = (otherBody === centerChopstick);
                
                // Determine landing success or failure
                if (landingVelocity < 2.5 && isUprightLanding && hitTower) {
                    // Contacting the tower directly is no longer considered successful
                    gameOverMessage = 'Almost! Missed the catch arm.';
                    
                    // Give some points for effort
                    score += 300;
                    
                    // No attachment - let the rocket fall
                } else {
                    // Different crash messages based on what went wrong
                    if (landingVelocity >= 2.5) {
                        gameOverMessage = 'Rocket Crashed: Too Fast!';
                    } else if (!isUprightLanding) {
                        gameOverMessage = 'Rocket Crashed: Not Upright!';
                    } else {
                        gameOverMessage = 'Crash: Missed Target!';
                    }
                }
                
                endGame();
                break; // Exit loop after handling collision
            }
        }
    });
}

// End the game
function endGame() {
    gameActive = false;
    scoreDisplay.textContent = `Score: ${score}`;
    gameOverMessageElement.textContent = gameOverMessage;
    finalScoreElement.textContent = score;
    gameOverElement.classList.remove('hidden');
    
    // Move debug display to the bottom left when game is over
    if (debugDisplayElement) {
        debugDisplayElement.style.top = 'auto';
        debugDisplayElement.style.bottom = '10px';
    }
    
    // Check if this was a successful landing
    if (gameOverMessage.includes('Perfect Mechazilla Catch')) {
        successfulLandings++;
        
        // Increase difficulty every 2 successful landings
        if (successfulLandings % 2 === 0 && difficultyLevel < 5) {
            difficultyLevel++;
            gameOverMessageElement.textContent = `${gameOverMessage}\nDifficulty increased to level ${difficultyLevel}!`;
        }

        // Update the restart hint to be more celebratory
        document.querySelector('.restart-hint').textContent = '🎉 Press SPACE for next round! 🎉';
        restartButton.textContent = 'Next Round';
    } else {
        // Reset the restart hint and button text for failures
        document.querySelector('.restart-hint').textContent = 'or press SPACE to restart';
        restartButton.textContent = 'Restart';
    }
    
    // Add focus to the restart button for keyboard accessibility
    restartButton.focus();
}

// Reset the game
function resetGame() {
    // Cancel any existing animation frame to avoid multiple loops
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    // Reset the physics environment
    if (rocketCatchConstraint) {
        Composite.remove(engine.world, rocketCatchConstraint);
        rocketCatchConstraint = null;
    }
    if (rocketCatchConstraint2) {
        Composite.remove(engine.world, rocketCatchConstraint2);
        rocketCatchConstraint2 = null;
    }
    
    // Reset engine gravity to normal
    engine.gravity.y = GRAVITY;
    
    // Reset visual appearance of tower and catch arm
    centerChopstick.render.fillStyle = '#666666';
    if (rightCatchArm) {
        rightCatchArm.render.strokeStyle = difficultyLevel === 1 ? '#ff3300' : 
                           difficultyLevel === 2 ? '#ff6600' : 
                           difficultyLevel === 3 ? '#ff9900' : 
                           difficultyLevel === 4 ? '#ffcc00' : '#ffff00';
        rightCatchArm.render.lineWidth = 2;
    }
    
    // Reset throttle level
    throttleLevel = 0;
    
    // Calculate randomness based on difficulty level
    const difficultyFactor = 1 + (difficultyLevel - 1) * 0.2; // Each level increases randomness by 20%
    
    // Generate random starting conditions with increasing difficulty
    let randomX;
    if (difficultyLevel === 1) {
        // For difficulty 1, start on the right side (between 70% and 90% of canvas width)
        randomX = CANVAS_WIDTH * (0.7 + Math.random() * 0.2);
    } else {
        // For other difficulties, use the full range (between 20% and 80% of canvas width)
        randomX = CANVAS_WIDTH * (0.2 + Math.random() * 0.6);
    }
    const randomY = 50 + Math.random() * (50 * difficultyFactor); // Higher starting position with difficulty
    const randomAngle = (Math.random() - 0.5) * (0.2 * difficultyFactor); // Larger initial tilt with difficulty
    
    // Random initial velocity with much more variance
    const speedVariance = 3.5 * difficultyFactor; // Increased from 2 to 3.5 for more variance
    const randomVelocityX = (Math.random() - 0.5) * speedVariance; // More extreme horizontal velocity
    
    // Random Y velocity can now be both positive and negative (sometimes rocket moving up)
    const randomVelocityY = (Math.random() * 2 - 0.8) * difficultyFactor; // More variable vertical speed
    
    // Sometimes add a sudden "burst" of velocity for extra challenge
    if (difficultyLevel > 1 && Math.random() < 0.3) {
        // 30% chance of a burst in a random direction
        const burstAngle = Math.random() * Math.PI * 2; // Random direction
        const burstMagnitude = 1 + Math.random() * difficultyFactor; // Random strength
        
        // Add the burst component to initial velocity
        randomVelocityX += Math.cos(burstAngle) * burstMagnitude;
        randomVelocityY += Math.sin(burstAngle) * burstMagnitude;
    }
    
    // Reset position and physics with increased randomness
    Body.setPosition(rocket, { x: randomX, y: randomY });
    Body.setVelocity(rocket, { x: randomVelocityX, y: randomVelocityY });
    Body.setAngle(rocket, randomAngle);
    Body.setAngularVelocity(rocket, (Math.random() - 0.5) * (0.04 * difficultyFactor)); // Doubled angular velocity randomness
    
    // Reset moment of inertia
    Body.setInertia(rocket, rocket.inertia);
    
    // Reset game variables
    fuel = INITIAL_FUEL;
    score = 0;
    gameActive = true;
    alignmentDuration = 0; // Reset alignment duration
    
    // Update catch arm width based on new difficulty
    updateCatchArmWidth();
    
    // Update UI
    fuelDisplay.textContent = `Fuel: ${fuel}%`;
    velocityDisplay.textContent = `Velocity: 0.00 m/s`;
    thrustDisplay.textContent = `Thrust: 0%`;
    scoreDisplay.textContent = `Score: 0`;
    document.getElementById('difficulty').textContent = `Difficulty: ${difficultyLevel}`;
    alignmentStatusDisplay.textContent = 'Status: Not aligned';
    alignmentStatusDisplay.style.color = '#ff3300';
    gameOverElement.classList.add('hidden');
    
    // Clear debug display
    if (debugDisplayElement) {
        debugDisplayElement.innerHTML = '<strong>DEBUG ALIGNMENT:</strong><br>Waiting for alignment attempt...';
        debugDisplayElement.style.top = '120px';
        debugDisplayElement.style.bottom = 'auto';
    }
}

// Restart the game
restartButton.addEventListener('click', () => {
    if (Date.now() - lastLandingTime > 500) {
        resetGame();
        animationFrameId = requestAnimationFrame(gameLoop);
    }
});

// Start the game
window.addEventListener('load', () => {
    init();
    animationFrameId = requestAnimationFrame(gameLoop);
});

// Draw the rocket with visible catch points
function drawRocketWithCatchPoints() {
    const ctx = canvas.getContext('2d');
    const rocketPos = rocket.position;
    const rocketAngle = rocket.angle;
    
    // Get rocket dimensions
    const rocketWidth = 14;
    const rocketHeight = 70;
    
    // Save context for transformations
    ctx.save();
    
    // Move to rocket position and rotate
    ctx.translate(rocketPos.x, rocketPos.y);
    ctx.rotate(rocketAngle);
    
    // Draw main rocket body
    ctx.fillStyle = '#e0e0e0';
    ctx.strokeStyle = '#aaaaaa';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(-rocketWidth/2, -rocketHeight/2, rocketWidth, rocketHeight);
    ctx.fill();
    ctx.stroke();
    
    // Draw rocket fins (smaller and less prominent)
    ctx.fillStyle = '#cccccc';
    ctx.beginPath();
    ctx.moveTo(-rocketWidth/2, rocketHeight/2 - 10); // Reduced height by starting 10px from bottom instead of 15px
    ctx.lineTo(-rocketWidth/2 - 5, rocketHeight/2); // Reduced protrusion from 8px to 5px
    ctx.lineTo(-rocketWidth/2, rocketHeight/2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(rocketWidth/2, rocketHeight/2 - 10); // Reduced height by starting 10px from bottom instead of 15px
    ctx.lineTo(rocketWidth/2 + 5, rocketHeight/2); // Reduced protrusion from 8px to 5px
    ctx.lineTo(rocketWidth/2, rocketHeight/2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Draw catch points (highlighted in red)
    const catchPointsY = -rocketHeight/2 + 15; // Position the catch points closer to the top
    
    // Left catch point
    ctx.fillStyle = '#ff3300';
    ctx.beginPath();
    ctx.arc(-rocketWidth/2 - 2, catchPointsY, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Right catch point
    ctx.beginPath();
    ctx.arc(rocketWidth/2 + 2, catchPointsY, 3, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

// Calculate the catch arm width based on difficulty level
function calculateCatchArmWidth() {
    // Decrease width as difficulty increases
    // Difficulty 1: 100% of base width
    // Difficulty 5: 40% of base width
    const scaleFactor = 1 - ((difficultyLevel - 1) * 0.15);
    return Math.max(20, Math.round(BASE_CATCH_ARM_WIDTH * scaleFactor));
}

// Update the catch arm width based on difficulty level
function updateCatchArmWidth() {
    // Remove the old catch arm
    Composite.remove(engine.world, rightCatchArm);
    
    // Calculate new catch arm width
    const newCatchArmWidth = calculateCatchArmWidth();
    
    // Position for the catch arms
    const padY = CANVAS_HEIGHT - 20;
    const chopstickHeight = 160;
    const catchPointY = padY - chopstickHeight + 30;
    const catchArmHeight = 8;
    
    // Create new catch arm with updated width
    rightCatchArm = Bodies.rectangle(
        CANVAS_WIDTH / 2 + newCatchArmWidth / 2 + 5, 
        catchPointY,
        newCatchArmWidth,
        catchArmHeight,
        { 
            isStatic: true, 
            render: { 
                fillStyle: '#888888', 
                strokeStyle: difficultyLevel === 1 ? '#ff3300' : 
                             difficultyLevel === 2 ? '#ff6600' : 
                             difficultyLevel === 3 ? '#ff9900' : 
                             difficultyLevel === 4 ? '#ffcc00' : '#ffff00',
                lineWidth: 2 
            },
            collisionFilter: {
                group: -1,  // Negative group means it won't collide with anything
                category: 0x0002,
                mask: 0x0000  // Won't collide with any category
            }
        }
    );
    
    // Add the new catch arm to the world
    Composite.add(engine.world, rightCatchArm);
}

// Attach the rocket to the catch arm
function attachRocketToCatchArm() {
    // Calculate positions for both catch points
    const catchPointY = -35 + 15; // Relative to rocket center (-35 is half height, +15 is catch point offset)
    
    // Right catch point
    const rightCatchPointX = 7 + 2;   // Half width (7 = 14/2) + catch point offset
    const rightRotatedX = Math.cos(rocket.angle) * rightCatchPointX - Math.sin(rocket.angle) * catchPointY;
    const rightRotatedY = Math.sin(rocket.angle) * rightCatchPointX + Math.cos(rocket.angle) * catchPointY;
    
    // Left catch point
    const leftCatchPointX = -(7 + 2);   // Negative of right catch point X
    const leftRotatedX = Math.cos(rocket.angle) * leftCatchPointX - Math.sin(rocket.angle) * catchPointY;
    const leftRotatedY = Math.sin(rocket.angle) * leftCatchPointX + Math.cos(rocket.angle) * catchPointY;
    
    // Calculate world coordinates for both catch points
    const rightWorldX = rocket.position.x + rightRotatedX;
    const rightWorldY = rocket.position.y + rightRotatedY;
    
    const leftWorldX = rocket.position.x + leftRotatedX;
    const leftWorldY = rocket.position.y + leftRotatedY;
    
    // Calculate the middle point between the two catch points
    const middleWorldX = (rightWorldX + leftWorldX) / 2;
    const middleWorldY = (rightWorldY + leftWorldY) / 2;
    
    // Calculate middle point in rocket's local coordinates
    const middleLocalX = (rightCatchPointX + leftCatchPointX) / 2; // Should be 0
    const middleLocalY = catchPointY; // Same Y as the catch points
    
    // Calculate rotated middle point
    const middleRotatedX = Math.cos(rocket.angle) * middleLocalX - Math.sin(rocket.angle) * middleLocalY;
    const middleRotatedY = Math.sin(rocket.angle) * middleLocalX + Math.cos(rocket.angle) * middleLocalY;
    
    // Calculate the middle point on catch arm relative to its center
    const middleArmPointX = middleWorldX - rightCatchArm.position.x;
    const middleArmPointY = middleWorldY - rightCatchArm.position.y;
    
    // Change catch arm color to indicate successful catch
    rightCatchArm.render.strokeStyle = '#00ff00';
    rightCatchArm.render.lineWidth = 3;
    
    // Create single constraint at the middle point
    rocketCatchConstraint = Constraint.create({
        bodyA: rocket,
        bodyB: rightCatchArm,
        pointA: { x: middleRotatedX, y: middleRotatedY }, // Middle point relative to rocket center
        pointB: { x: middleArmPointX, y: middleArmPointY }, // Middle point on the arm
        stiffness: 0.8, // Slightly less stiff to allow dangling movement
        length: 0,
        render: {
            visible: true,
            lineWidth: 2,
            strokeStyle: '#00ff00'
        }
    });
    
    // Add the constraint to the world
    Composite.add(engine.world, rocketCatchConstraint);
    
    // Set rocketCatchConstraint2 to null (we're not using it anymore)
    rocketCatchConstraint2 = null;
    
    // Reduce gravity to simulate successful catch
    engine.gravity.y = 0.05;
    
    // Stabilize the rocket initially
    Body.setAngularVelocity(rocket, 0);
    Body.setVelocity(rocket, { x: 0, y: 0 });
    
    // Use a lower moment of inertia to allow natural dangling
    Body.setInertia(rocket, 5000); // Lower than before to allow more natural physics and dangling
}

// Attach the rocket to the tower
function attachRocketToTower(otherBody) {
    // Calculate the position for the constraint based on the rocket's catch point
    const catchPointY = -35 + 15; // Same offset used in checkForAlignmentLanding
    const catchPointX = 7 + 2;
    
    // Transform to get world coordinates
    const rotatedX = Math.cos(rocket.angle) * catchPointX - Math.sin(rocket.angle) * catchPointY;
    const rotatedY = Math.sin(rocket.angle) * catchPointX + Math.cos(rocket.angle) * catchPointY;
    
    const worldCatchPointX = rocket.position.x + rotatedX;
    const worldCatchPointY = rocket.position.y + rotatedY;
    
    // Calculate point on tower relative to its center
    const towerPointX = worldCatchPointX - otherBody.position.x;
    const towerPointY = worldCatchPointY - otherBody.position.y;
    
    // Change tower color to indicate landing (but not success)
    centerChopstick.render.fillStyle = '#dd6644'; // Orangish color to indicate "not quite right"
    
    // Create a constraint to join the rocket to the tower
    rocketCatchConstraint = Constraint.create({
        bodyA: rocket,
        bodyB: otherBody,
        pointA: { x: rotatedX, y: rotatedY }, // Relative to rocket center
        pointB: { x: towerPointX, y: towerPointY }, // Exact matching point on tower
        stiffness: 0.7, // Less stiff than the catch arm attachment
        length: 0,
        render: {
            visible: true,
            lineWidth: 1,
            strokeStyle: '#dd6644' // Matching color
        }
    });
    
    // Add the constraint to the world
    Composite.add(engine.world, rocketCatchConstraint);
    
    // Reduce gravity to simulate successful catch
    engine.gravity.y = 0.05;
    
    // Stabilize the rocket
    Body.setAngularVelocity(rocket, 0);
    Body.setVelocity(rocket, { x: 0, y: 0 });
    
    // Lock the rocket's rotation for stability
    Body.setInertia(rocket, 99999); // Very high moment of inertia to resist rotation
}