(function() {

"use strict";

// =============================================================================
//  Config
// =============================================================================

var DEBUG= false;

var mazeWidth= 5;
var mazeHeight= 5;
var pxTileSize= 64;

// Breite in Tiles des gequetschten Aussenbereiches
var borderX= 2;
var borderY= 2;

var SUPPORT_HDPI= true;

// =============================================================================
//  Constants
// =============================================================================

var PRINCESS= -8;
var PLAYER= -7;
var SKELETON= -6;
var DOOR= -5;
var KEY= -4;
var CALC= -3;
var FRAME= -2;
var WALL= -1;
var FLOOR= 0;

var DIRS= [ [ 0, -1 ], [ 1, 0 ], [ 0, 1 ], [ -1, 0 ] ];

var EPSILON= 0.000001;

var TICKS_PER_SECOND= 50;

// touch-action: none; -moz-user-select: none;

// =============================================================================
//  Globals
// =============================================================================

var mouseX;
var mouseY;

var canvas;
var c;
var cWidth;
var cHeight;

var maze;
var pxTileSize_;
// var pxMazeWidth;
// var pxMazeHeight;
var items;
var startKey;
var goalKey;
var player;
var npcs;
var itemSpeed;
var playerSpeed;
var npcSpeed;
var fightCount;
var pixelRatio;


// =============================================================================
//  Misc. tools
// =============================================================================

var even= function( f ) {
    return f & ~1;
}

var mkFighting= function( base, fact ) {
    return function() { return Math.floor((base + fightCount * fact) % 6); };
};

var characterCount= 0;

var initCharacter= function( type ) {
    var ch= {
        type: type,
        index: characterCount++,

        x: 0,
        y: 0,
        width: .6,
        height: .8,
        scale: 1.25,

        mazeX: 0,
        mazeY: 0,
        toKey: '0:0',    // Maze x/y heading(!!) position. may not be actual position
        isMoving: false,
        movementX: 0,
        movementY: 0,
        projX: 0,
        projY: 0,
        fightBuddy: undefined,
        life: 100,
    }

    if ( type === PLAYER ) {
        ch.items= [];   // Items the player holds
        ch.fighting= mkFighting(0, 1.1);
    }
    else {
        ch.atTarget= 0;
        ch.steps= [];
        ch.stepIndex= 0;
        ch.stepCount= 0;
        ch.fighting= mkFighting(characterCount * 1.5, .9);
    }

    return ch;
};

var random= function( from, until ) {
    return Math.floor(Math.random() * (until - from) + from);
};

var randomf= function( from, until ) {
    return Math.random() * (until - from) + from;
};


// =============================================================================
//  Calculate distances from point in maze
// =============================================================================

var calcDistances= function( startPosX, startPosY ) {

    var distance= 0;
    var key= startPosX + ':' + startPosY;
    var queue= [ [ key, startPosX, startPosY, distance ] ];
    var startKey= key;
    var maxDistanceKey= key;
    var maxDistance= distance;

    var lookup= {};
    lookup[key]= [ startPosX, startPosY, distance, undefined ];

    var byDistance= [ [ key ] ];
    var deadEnds= [];

    while ( queue.length > 0 ) {
        var pos= queue.pop();
        var key= pos[0];
        var posX= pos[1];
        var posY= pos[2];
        var distance= pos[3] + 1;

        var isDeadEnd= true;
        for ( var dir= 0; dir < 4; dir++ ) {
            var nextPosX= posX + DIRS[dir][0];
            var nextPosY= posY + DIRS[dir][1];
            if ( maze[nextPosY][nextPosX] < FLOOR ) continue;

            var nextKey= nextPosX + ':' + nextPosY;
            if ( nextKey in lookup ) continue;

            lookup[nextKey]= [ nextPosX, nextPosY, distance, key ];

            // Children merken, falls benoetigt
            // lookup[key].push(nextKey);

            if ( byDistance.length - 1 < distance ) {
                byDistance[distance]= [ nextKey ];
            }
            else {
                byDistance[distance].push(nextKey);
            }

            queue.push([ nextKey, nextPosX, nextPosY, distance ]);
            isDeadEnd= false;

            if ( distance > maxDistance ) {
                maxDistanceKey= nextKey;
                maxDistance= distance;
            }
        }
        if ( isDeadEnd ) {
            deadEnds.push(key);
        }
    }

    return {
        lookup: lookup,
        startKey: startKey,
        maxDistance: maxDistance,
        maxDistanceKey: maxDistanceKey,
        byDistance: byDistance,
        deadEnds: deadEnds,
    };
};

var updateMazeFloor= function( dists ) {

    // Set maze floor data
    for ( var key in dists.lookup ) {
        var pos= dists.lookup[key];
        maze[pos[1]][pos[0]]= FLOOR + pos[2];
    }
}


// =============================================================================
//  Generate new maze
// =============================================================================

// Generate Doors & Keys
var genItems= function( dists ) {
    items= {};

    var lookup= dists.lookup;
    var maxDistance= dists.maxDistance;
    var maxDistanceKey= dists.maxDistanceKey;
    var deadEnds= dists.deadEnds;

    startKey= dists.startKey;
    goalKey= maxDistanceKey;

    var solution= [];
    var solutionLookup= {};

    var key= maxDistanceKey;
    while ( key ) {
        solutionLookup[key]= maxDistance - solution.length;
        solution.unshift([ key ]);
        key= lookup[key][3];
    }

    for ( var i= 0; i < deadEnds.length; i++ ) {
        var key= deadEnds[i];
        if ( key === maxDistanceKey ) continue;

        var prevKey= undefined;
        while ( key ) {
            if ( key in solutionLookup ) {
                solution[solutionLookup[key]].push([ deadEnds[i], prevKey ]);
                break;
            }
            prevKey= key;
            key= lookup[key][3];
        }
    }

    var end= solution.length / 10;

    var DOOR_MAX_POS= end;
    var DOOR_MIN_POS= end * 2;
    var KEY_MIN_POS= end;

    // FIXME: Find sane formula
    var doorsMake= Math.floor(Math.pow(mazeWidth * mazeHeight, .45) * .5);

doorsMake= 0;

    items[startKey]= { type: DOOR, color: doorsMake + 1, opening: -1, closing: 0, lightning: 0, isGoal: true };
    items[goalKey]= { type: KEY, color: doorsMake + 1 };

    var _makeDoorKey= function( doorKey, ix ) {
        var keyKey;
        var entryKeyKey;
        var ix1= random(KEY_MIN_POS, ix);
        while ( ix1 < ix ) {
            if ( solution[ix1].length > 1 ) {
                var deadEndInfo= solution[ix1][random(1, solution[ix1].length)];
                if ( !(deadEndInfo[0] in items) ) {
                    keyKey= deadEndInfo[0];
                    entryKeyKey= deadEndInfo[1];
                    break;
                }
            }
            ix1++;
        }
        if ( keyKey !== undefined ) {
            doorsMake--;
            items[doorKey]= { type: DOOR, color: doorsMake, opening: 0, closing: -1, lightning: 0, isGoal: false };
            items[keyKey]= { type: KEY, color: doorsMake };

            // 50% chance to place a key at start of junction to block current
            if ( doorsMake > 0 && entryKeyKey && Math.random() > .5 ) {
                _makeDoorKey(entryKeyKey, ix1);
            }
        }
    };

    for ( var i= doorsMake * 3; i > 0 && doorsMake > 0; i-- ) {
        var doorKey= undefined;
        var ix= random(DOOR_MIN_POS, solution.length - DOOR_MAX_POS);
        while ( ix >= DOOR_MIN_POS ) {
            if ( solution[ix].length === 1 && !(solution[ix] in items) ) {

                // Don't allow a door in a bend, where the player can sneak past it.
                var mazeX= lookup[solution[ix][0]][0];
                var mazeY= lookup[solution[ix][0]][1];
                if (   (maze[mazeY][mazeX - 1] < FLOOR || maze[mazeY - 1][mazeX] < FLOOR)
                    && (maze[mazeY][mazeX + 1] < FLOOR || maze[mazeY - 1][mazeX] < FLOOR)
                    && (maze[mazeY][mazeX - 1] < FLOOR || maze[mazeY + 1][mazeX] < FLOOR)
                    && (maze[mazeY][mazeX + 1] < FLOOR || maze[mazeY + 1][mazeX] < FLOOR)
                ) {
                    doorKey= solution[ix][0];
                    break;
                }
            }
            ix--;
        }
        if ( doorKey !== undefined ) {
            _makeDoorKey(doorKey, ix);
        }
    }

    // console.table(lookup);
    // console.table(solution);
    // console.log(solutionLookup);
    // console.table(items);
    // console.log(deadEnds);
    // console.table(solution);

    return doorsMake === 0;
};

var genNpcs= function( dists ) {
    var lookup= dists.lookup;

    npcs= [];

/*
var npc= initCharacter(SKELETON);
npc.pxX= (lookup[startKey][0] - .5) * pxTileSize;
npc.pxY= (lookup[startKey][1] - .5) * pxTileSize;
npcs.push(npc);
if(0)
*/
if(1)    for ( var key in items ) {
        if ( items[key].type === KEY ) {
            var npc= initCharacter(SKELETON);
            npc.x= lookup[key][0] - .5;
            npc.y= lookup[key][1] - .5;
            npcs.push(npc);
        }
    };

    var npc= initCharacter(PRINCESS);
    npc.x= lookup[goalKey][0] - .5;
    npc.y= lookup[goalKey][1] - .5;
    npcs.push(npc);
};

var _genMaze= function() {

    // pxMazeWidth= mazeWidth * pxTileSize;
    // pxMazeHeight= mazeHeight * pxTileSize;

    maze= [];
    for ( var y= 0; y <= mazeHeight + 1; y++ ) {
        maze[y]= [];
    }

    for ( var y= 1; y <= mazeHeight; y += 2 ) {
        for ( var x= 1; x <= mazeWidth; x += 2 ) {
            maze[y][x]= CALC;
            maze[y][x + 1]= WALL;
            maze[y + 1][x]= WALL;
            maze[y + 1][x + 1]= WALL;
        }
    }

    for ( var y= 0; y <= mazeHeight + 1; y++ ) {
        maze[y][0]= FRAME;
        maze[y][mazeWidth + 1]= FRAME;
    }

    for ( var x= 1; x <= mazeWidth; x++ ) {
        maze[0][x]= FRAME;
        maze[mazeHeight + 1][x]= FRAME;
    }

    // Slow, horrible and naive. Ok for now...

    var floor= FLOOR;

    while ( true ) {

        var sample= [];
        for ( var y= 1; y <= mazeHeight; y += 2 ) {
            for ( var x= 1; x <= mazeWidth; x += 2 ) {
                if ( maze[y][x] === CALC ) sample.push([ x, y ]);
            }
        }
        if ( sample.length === 0 ) break;

        var retry= true;
        while ( retry ) {
            retry= false;

            var pos= sample[random(0, sample.length)];
            var posX= pos[0];
            var posY= pos[1];

            while ( maze[posY][posX] === CALC ) {
                maze[posY][posX]= floor;

                var dir= random(0, 4);

                // IDEE: bei i === 3 bzw === 2 werden wirds wiggliger
                var i_max= floor === FLOOR ? 4 : 2;
                for ( var i= 0; i < i_max; i++ ) {
                    var wallPosX= posX + DIRS[dir][0];
                    var wallPosY= posY + DIRS[dir][1];
                    if ( maze[wallPosY][wallPosX] === WALL ) {
                        var floorPosX= posX + DIRS[dir][0] * 2;
                        var floorPosY= posY + DIRS[dir][1] * 2;
                        if ( maze[floorPosY][floorPosX] !== floor ) {
                            maze[wallPosY][wallPosX]= floor;
                            posX += DIRS[dir][0] * 2;
                            posY += DIRS[dir][1] * 2;
                            break;
                        }
                    }
                    dir= (dir + 1) & 3;
                }
                if ( i >= i_max && floor > FLOOR ) {
                    for ( var y= 1; y <= mazeHeight; y += 2 ) {
                        for ( var x= 1; x <= mazeWidth; x += 2 ) {
                            if ( maze[y][x] === floor ) maze[y][x]= CALC;
                            if ( maze[y][x + 1] === floor ) maze[y][x + 1]= WALL;
                            if ( maze[y + 1][x] === floor ) maze[y + 1][x]= WALL;
                        }
                    }
                    retry= true;
                    break;
                }
            }
        }

        floor++;
    }


    // Find most distant cell
    var dists= calcDistances(1,1);
    var startPos= dists.lookup[dists.maxDistanceKey];

    // Take the most distant cell and recalculate distances
    dists= calcDistances(startPos[0], startPos[1]);

    updateMazeFloor(dists);

    player.x= startPos[0] - .5;
    player.y= startPos[1] - .5;

    if ( genItems(dists) ) {
        genNpcs(dists);
        return true;
    }
}

var genMaze= function() {

    // Try limited times
    for ( var i= 0; i < 100; i++ ) {
        if ( _genMaze() ) return;
    }

    // Failed
    npcs= [];
    return;
};


// =============================================================================
//  Projection
// =============================================================================

// Static, to reduce GCs
var projX= [];
var projY= [];

// FIXME: Optimieren: nur aufrufen wenn notwendig?

var calcTileProj= function( pos, proj, p ) {

    var PI_2= Math.PI / 2;

    var pxTargetSize= p.pxTargetSize;
    var border= p.border;
    var mazeSize= p.mazeSize;

    var pxBorder= pxTileSize_ * border;
    if ( pxBorder > pxTargetSize * .4 ) {
        pxBorder= pxTargetSize * .4;
    }
    var pxMazeSize= pxTileSize_ * mazeSize;
    var pxMazeMove= pxTargetSize - pxMazeSize;
    if ( pxMazeMove > 0 ) pxMazeMove= 0;

    // Spieler kann nicht ganz an Rand laufen, also "pos" strecken
    pos= (pos - 1) * (mazeSize + 2) / mazeSize;
    if ( pos < 0 ) pos= 0;
    if ( pos > mazeSize ) pos= mazeSize;

    var pxTile0= pxMazeMove * pos * pxTileSize_ / pxMazeSize;

    if ( pxMazeSize < pxTargetSize ) {
        pxTile0 += (pxTargetSize - pxMazeSize) / 2;
        pxTargetSize= pxTile0 + pxMazeSize;
    }

    var borderTile0= -1;
    var borderTile1= mazeSize;

    var pxTileN= pxTile0 + pxMazeSize;
    var pxTile= pxTile0;

    // <= !! Ein zusaetzlicher Wert wird noch benoetigt
    for ( var tile= 0; tile <= mazeSize; tile++ ) {

        if ( pxTile < pxBorder ) {
            borderTile0= tile;

            var fTile= (pxTile - pxTile0) / (pxBorder - pxTile0);
            proj[tile]= Math.pow(fTile, 1.5) * pxBorder;

        }
        else if ( pxTile >= pxTargetSize - pxBorder ) {
            if ( borderTile1 === mazeSize ) borderTile1= tile;

            var fTile= (pxTile - pxTileN) / (pxTargetSize - pxBorder - pxTileN);
            proj[tile]= pxTargetSize - Math.pow(fTile, 1.5) * pxBorder;
        }
        else {
            proj[tile]= pxTile;
        }

        pxTile += pxTileSize_;
    }

    // Zu breite Tiles abschmaelern (Passiert durch Math.pow)
    for ( ; borderTile0 >= 0; borderTile0-- ) {
        if ( proj[borderTile0 + 1] - proj[borderTile0] > pxTileSize_ ) {
            proj[borderTile0]= proj[borderTile0 + 1] - pxTileSize_;
        }
    }

    for ( ; borderTile1 < mazeSize; borderTile1++ ) {
        if ( proj[borderTile1] - proj[borderTile1 - 1] > pxTileSize_ ) {
            proj[borderTile1]= proj[borderTile1 - 1] + pxTileSize_;
        }
    }
};

var updateCharacterProj= function( ch ) {
    var x= ch.x;
    var y= ch.y;
    var mazeX= Math.floor(x);
    var mazeY= Math.floor(y);
    var fracX= x - mazeX;
    var fracY= y - mazeY;
    ch.projX= projX[mazeX] + (projX[mazeX + 1] - projX[mazeX]) * fracX;
    ch.projY= projY[mazeY] + (projY[mazeY + 1] - projY[mazeY]) * fracY;
};

// TODO: Optimieren falls oefter benoetigt
var invProj= function( x, y ) {
    for ( var xi= projX.length - 2; xi >= 0; xi-- ) {
        if ( x >= projX[xi] ) {
            for ( var yi= projY.length - 2; yi >= 0; yi-- ) {
                if ( y >= projY[yi] ) {
                    return [ xi + (x - projX[xi]) / (projX[xi + 1] - projX[xi])
                           , yi + (y - projY[yi]) / (projY[yi + 1] - projY[yi]) ];
                }
            }
            return;
        }
    }
};

var calcProjs= function() {

    calcTileProj(player.x, projX, {
        pxTargetSize: cWidth,
        border: borderX,
        mazeSize: mazeWidth,
    });

    calcTileProj(player.y, projY, {
        pxTargetSize: cHeight,
        border: borderY,
        mazeSize: mazeHeight,
    });

    updateCharacterProj(player);

    for ( var i= 0; i < npcs.length; i++ ) {
        updateCharacterProj(npcs[i]);
    }
};


// =============================================================================
//  Sprites
// =============================================================================

var IMAGE_TILES= 0;
var IMAGE_TILE_SHADOWS= 1;
var IMAGE_PLAYER= 2;
var IMAGE_MONSTER1= 3;
var IMAGE_PRINCESS= 4;

var imageFiles= [
    'sprites.png', 'shadows.png', 'player.png', 'monster1.png', 'princess.png'
];
var imageSizes= [
    128, 128, 64, 64, 64
];

var images= [];

var tempCanvas= document.createElement('canvas');
var tempContext= tempCanvas.getContext('2d');

var cachedRgbs= [];

var getRgb= function( color ) {
    if ( !(color in cachedRgbs) ) {
        tempContext.fillStyle= 'hsl(' + (color * 50) + ',100%,60%)';
        tempContext.fillRect(0, 0, 1, 1);
        var rgba= tempContext.getImageData(0, 0, 1, 1).data;
        cachedRgbs[color]= [ rgba[0], rgba[1], rgba[2] ];
    }
    return cachedRgbs[color];
}

var loadImage= function( url, cb ) {
    var image= new Image();
    image.src= url;
    image.onload= function() {
        image.onload= undefined;
        cb(image);
    };
}

var loadImages= function( cb ) {
    if ( images.length < imageFiles.length ) {
        loadImage(imageFiles[images.length], function( image ) {
            images.push(image);
            loadImages(cb);
        });
        return;
    }
    cb();
}

var cachedImages= [];

var getImage= function( imageIndex, x, y, width, height, color, withShadow ) {

    var image= images[imageIndex];

    if ( width === undefined ) width= pxTileSize;
    if ( height === undefined ) height= pxTileSize;

    var key= imageIndex + ':' + x + ':' + y + ':' + width + ':' + height + ':' + color;
    if ( !(key in cachedImages) ) {

// console.log("_GET_IMAGE", key);

        x *= imageSizes[imageIndex];
        y *= imageSizes[imageIndex];

        width= Math.floor(width * pixelRatio);
        height= Math.floor(height * pixelRatio);

        tempCanvas.width= width;
        tempCanvas.height= height;
        tempContext.drawImage(image, x, y, imageSizes[imageIndex], imageSizes[imageIndex], 0, 0, width, height);

        if ( color !== undefined ) {
            var imageData= tempContext.getImageData(0, 0, width, height);
            var rgb= getRgb(color);
            var rgba= imageData.data;
            for ( var i= width * height * 4 - 4; i >= 0; i -= 4 ) {
                if ( rgba[i] === 0 && rgba[i + 3] !== 0 ) {
                    rgba[i]= rgb[0];
                    rgba[i + 1]= rgb[1];
                    rgba[i + 2]= rgb[2];
                }
            }
            tempContext.putImageData(imageData, 0, 0);
        }

        if ( withShadow ) {
            tempContext.drawImage(images[imageIndex + 1], x, y, imageSizes[imageIndex], imageSizes[imageIndex], 0, 0, width, height);
        }

        var image= new Image();
        image.src = tempCanvas.toDataURL("image/png");
        cachedImages[key]= image;
    }

    return cachedImages[key];
}

var getItemImage= function( item, width, height ) {
    if ( item.type === KEY ) {
        return getImage(IMAGE_TILES, 0, 0, width, height, item.color, true);
    }
    if ( item.type === DOOR ) {
        var pos;
        if ( item.opening >= 0 ) pos= item.opening;
        else if ( item.closing >= 0 ) pos= 7 - item.closing;
        else return;

        return getImage(IMAGE_TILES, Math.floor(pos), 1, width, height, item.color, true);
    }
};


// =============================================================================
//  Draw Canvas
// =============================================================================

var drawRect= function( x, y, w, h, hue ) {
    c.fillStyle= 'hsl(' + hue + ',100%,60%)';
    c.fillRect(x - w / 2, y - h / 2, w, h);
};

var drawMaze= function() {
    var c_= c; // Localize

    for ( var mazeY= 0; mazeY < mazeHeight; mazeY++ ) {
        for ( var mazeX= 0; mazeX < mazeWidth; mazeX++ ) {

            var px0= projX[mazeX];
            var px1= projX[mazeX + 1]
            var py0= projY[mazeY];
            var py1= projY[mazeY + 1]

            var content= maze[mazeY + 1][mazeX + 1];

            if ( content === WALL ) {
                // c_.fillStyle = 'rgb(' + Math.floor(255 * mazeX / mazeWidth) + ',' + (((mazeX + mazeY) & 1) ? 100 : 0) + ',0)';
                c_.fillStyle = 'rgb(20,100,0)';
            }
            else if ( content >= FLOOR ) {
                c_.fillStyle = 'hsl(10,50%,' + (80 - content * 1 + FLOOR) +'%)';
            }
            else {
                c_.fillStyle = 'rgb(0,0,0)';
            }

            // Close gaps by adding .4
            c_.fillRect(px0, py0, px1 - px0 + .4, py1 - py0 + .4);

            var key= (mazeX + 1) + ':' + (mazeY + 1);
            if ( key in items ) {

                if ( items[key].type === KEY || items[key].type === DOOR ) {
                    var itemImage= getItemImage(items[key]);
                    if ( itemImage ) {
                        c.drawImage(itemImage, 0, 0, pxTileSize * pixelRatio, pxTileSize * pixelRatio, px0, py0, px1 - px0, py1 - py0);
                    }
                    if ( key === player.toKey && items[key].type === DOOR && items[key].opening === 0 ) {
                        var lightningImage= getImage(IMAGE_TILES, Math.floor(items[key].lightning), 2);
                        var yOfs= random(-2, 2);
                        c.drawImage(lightningImage, 0, 0, pxTileSize * pixelRatio, pxTileSize * pixelRatio, px0, py0 + yOfs, px1 - px0, py1 - py0 + yOfs);
                    }
                    continue;
                }

                var w= 10, h= 10;
                if ( items[key].type === DOOR ) w= 40, h= 40; else w= 20;
                drawRect((px0 + px1) / 2, (py0 + py1) / 2, w, h, items[key].color * 40);
            }
        }
    }
}

var drawImage= function( imageIndex, imageX, imageY, imageWidth, imageHeight, x, y, color ) {
    var image= getImage(imageIndex, imageX, imageY, imageWidth, imageHeight, color);
    c.drawImage(image, 0, 0, image.width, image.height, x - imageWidth / 2, y - imageHeight / 2, imageWidth, imageHeight);
}

var facing= function( movementX, movementY ) {
    if ( Math.abs(movementX) > Math.abs(movementY) ) {
        return movementX < 0 ? 9 : 11;
    }
    return movementY < 0 ? 8 : 10;
}

var stars= [];
var MIN_STAR_SIZE= 10;

var addStar= function( startX, startY, isPlayer ) {
    for ( var i= 0; i < 10; i++ ) {
        if ( stars[i] === undefined || stars[i].size < MIN_STAR_SIZE ) {
            stars[i]= {
                x: startX,
                y: startY,
                vx: random(-4, 4),
                vy: random(-5, -10),
                size: random(40, 70),
                color: isPlayer ? 2.4 : 0,
            };
            return;
        }
    }
}

var drawCharacter= function( ch ) {
    var imageX;
    var imageY;
    var imageIndex;

    var imageSize= pxTileSize * ch.scale;
    var x= ch.projX;
    var y= ch.projY + (ch.height * 50 - imageSize) / 2 + 2;      // FIXME * 50

    if ( ch.life <= 0 ) {
        imageX= Math.min(5, Math.floor(-ch.life));
        imageY= 20;
        y += imageX * pxTileSize * .06;
        if ( ch.life < -20 ) {
            imageSize /= -19 - ch.life;
            if ( imageSize < 10 ) return;
        }
    }
    else if ( ch.isMoving ) {
        imageX= Math.floor(ch.x * 15 + ch.y * 25) % 8 + 1;
        imageY= facing(ch.movementX, ch.movementY);
    }
    else if ( ch.fightBuddy !== undefined ) {
        imageX= ch.fighting();

        if ( imageX === 5 ) {
            addStar((ch.fightBuddy.projX + ch.projX) / 2, (ch.fightBuddy.projY + ch.projY) / 2, ch === player);
        }

        imageY= facing(ch.fightBuddy.x - ch.x, ch.fightBuddy.y - ch.y) + 4;
    }
    else {
        imageX= 0;
        imageY= 10;
    }

    if ( ch.type === PLAYER ) {
        imageIndex= IMAGE_PLAYER;

        if ( ch.life > 0 && ch.fightBuddy === undefined ) {
            var key= ch.toKey;
            if ( key in items && items[key].type === DOOR && items[key].opening === 0 ) {
                imageX= 3;
                imageY= 2;
                x += random(pxTileSize * -.1, pxTileSize * .1);
            }
        }
    }
    else if ( ch.type === PRINCESS ) {
        imageIndex= IMAGE_PRINCESS;
    }
    else {
        imageIndex= IMAGE_MONSTER1;
    }

    drawImage(imageIndex, imageX, imageY, imageSize, imageSize, x, y);
};

var drawPlayer= function() {
    drawCharacter(player);
};

var drawCharacters= function() {

    // FIXME: GC-Friendly!!!
    var chs= [ player ].concat(npcs).sort(function( ch1, ch2 ) {
        if ( ch1.projY !== ch2.projY ) return ch1.projY - ch2.projY;
        if ( ch1.projX !== ch2.projX ) return ch1.projX - ch2.projX;
        return ch1.index - ch1.index;
    });

    for ( var i= 0; i < chs.length; i++ ) {
        drawCharacter(chs[i]);
    }
};

var drawPlayerItems= function() {
    var width= pxTileSize * 1.5;
    var height= pxTileSize * 1.5;

    // TODO: Show somewhere else if player is too near
    var x= 10;
    var dx= width + 10;

    for ( var i= 0; i < player.items.length; i++ ) {
        var inventoryImage= getImage(IMAGE_TILES, 2, 0, width, height);
        c.drawImage(inventoryImage, 0, 0, width, height, x, 10, width, height);
        var itemImage= getItemImage(player.items[i], width, height);
        if ( itemImage ) {
            c.drawImage(itemImage, 0, 0, width, height, x, 10, width, height);
        }
        x += dx;
    }
};

var drawStars= function() {
    for ( var i= 0; i < stars.length; i++ ) {
        var star= stars[i];
        if ( star.size < MIN_STAR_SIZE ) continue;

        drawImage(IMAGE_TILES, 0, 3, Math.floor(star.size), Math.floor(star.size), star.x, star.y, star.color);
        star.x += star.vx;
        star.y += star.vy;
        star.vy= star.vy * .9 + .2;
        star.size *= .95;
    }
}

var redraw= function() {
    calcProjs();

    //c.clearRect(0, 100, cWidth, cHeight);
    c.fillStyle= 'red';
// console.log("FILL", cWidth);
    c.fillRect(0, 0, cWidth, cHeight);

    drawMaze();
    drawCharacters();
    drawPlayerItems();

    drawStars();

    if ( player.fightBuddy ) {
        drawRect(cWidth / 2, cHeight - 40, (cWidth - 20) * Math.max(player.fightBuddy.life, 0) * .01, 10, 0);
    }

    drawRect(cWidth / 2, cHeight - 20, (cWidth - 20) * Math.max(player.life, 0) * .01, 10, 2.4 * 50);
};

var lastTimestamp;

var step= function( timestamp ) {
    if ( !lastTimestamp ) lastTimestamp= timestamp;
    var duration= timestamp - lastTimestamp;

    // 1000 / 40 == 25 FPS
    if ( duration >= 40 ) {
        lastTimestamp= timestamp;

        if ( DEBUG ) document.getElementById('debug').innerHTML= 1000 / duration;

        redraw();
    }
    window.requestAnimationFrame(step);
};

var lastPixelRatio;

var updateCanvas= function() {

    if ( SUPPORT_HDPI ) {
        var dpr= window.devicePixelRatio || 1;
        var bsr= c.webkitBackingStorePixelRatio
                || c.mozBackingStorePixelRatio
                || c.msBackingStorePixelRatio
                || c.backingStorePixelRatio
                || 1;
        pixelRatio= dpr / bsr;
// console.log("PIXELRATIO", dpr, bsr, window.innerWidth);
    }
    else {
        pixelRatio= 1;
    }

    cWidth= window.innerWidth;
    cHeight= window.innerHeight;
    canvas.style.width = cWidth + "px";
    canvas.style.height = cHeight + "px";
    canvas.width = cWidth * pixelRatio;
    canvas.height = cHeight * pixelRatio;

    pxTileSize_= pxTileSize * pixelRatio;

    // Nicht per scale(), da scale relative Werte nimmt
    c.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    if ( lastPixelRatio !== pixelRatio ) {
        cachedImages= [];
        lastPixelRatio= pixelRatio;
    }
}

var resizeCanvas= function() {
    updateCanvas();
    redraw();
};


// =============================================================================
//  Mouse
// =============================================================================

var MOUSE_CLICK_DELAY= 300;

var mousePress;
var mousePressTimestamp;

var onMouseMove= function( e ) {
    if ( e.changedTouches && e.changedTouches.length > 0 ) {
        mouseX= e.changedTouches[0].clientX;
        mouseY= e.changedTouches[0].clientY - 50;  // Offset so player is not above finger
        return;
    }
    mouseX= e.clientX;
    mouseY= e.clientY;
};

var onMouseDown= function( e ) {
    onMouseMove(e);
    mousePressTimestamp= e.timeStamp;
    player.isMoving= undefined;
}

var onMouseUp= function( e ) {
    if ( e.timeStamp - mousePressTimestamp < MOUSE_CLICK_DELAY ) {
        console.log("click", e);
        // click;
    }
    mousePressTimestamp= undefined;
    player.isMoving= undefined;
    if ( e.cancelable ) e.preventDefault();
};


// =============================================================================
//  Move player
// =============================================================================

//  1 2    walls:
//  8 4    On which sides does player collide -> Index into wallActions
//
//    1    wallActions:
//  8   2  Which position must be corrected
//    4    E.g: Walls at 2 + 4 + 8
//              ==> walls === 14
//              ==> wallAction[walls] === 12
//              ==> Correct left (8) and bottom (4)
//         wallAction for e.g. walls === 1 depend on player's heading

var WALL_ACTIONS= [
    [ 0, 1, 1, 1, 4, 0, 2, 3, 4, 8, 0, 9, 4, 12, 6, 0 ],        // horizontal movement
    [ 0, 8, 2, 1, 2, 0, 2, 3, 8, 8, 0, 9, 4, 12, 6, 0 ],        // vertical movement
];

var direction= 0;  // horizontal movement

var __movePlayer= function( x, y, result ) {

    var mazeX0= Math.floor(x - player.width * .5);
    var mazeY0= Math.floor(y - player.height * .5);
    var mazeX1= Math.floor(x + player.width * .5);
    var mazeY1= Math.floor(y + player.height * .5);

    var walls00= maze[mazeY0 + 1][mazeX0 + 1] < FLOOR ? 1 : 0;
    var walls01= maze[mazeY0 + 1][mazeX1 + 1] < FLOOR ? 2 : 0;
    var walls11= maze[mazeY1 + 1][mazeX1 + 1] < FLOOR ? 4 : 0;
    var walls10= maze[mazeY1 + 1][mazeX0 + 1] < FLOOR ? 8 : 0;

    var walls= walls00 + walls01 + walls10 + walls11;
    if ( walls ) {
        var action= WALL_ACTIONS[direction][walls];
        if ( action === 0 ) return;

// console.log("__movePlayer", walls, action, direction, player.width);
        if ( action & 1 ) y= mazeY1 + player.height * .5;
        if ( action & 2 ) x= mazeX0 + 1 - player.width * .5;
        if ( action & 4 ) y= mazeY0 + 1 - player.height * .5;
        if ( action & 8 ) x= mazeX1 + player.width * .5;

        // Limit movement to "playerSpeed"
        var dx= x - player.x;
        var dy= y - player.y;
        var dist= dx * dx + dy * dy;
        if ( dist >= playerSpeed ) {
            var alpha= Math.atan2(dx, dy);
            x= player.x + Math.sin(alpha) * playerSpeed;
            y= player.y + Math.cos(alpha) * playerSpeed;
        }
    }

    result[0]= x;
    result[1]= y;
};

var pxDirectionPlayerX= 0;
var pxDirectionPlayerY= 0;
var playerMouseX= 0;
var playerMouseY= 0;

// Static, to reduce GCs
var _movePlayerResult= [ 0, 0 ];

var _movePlayer= function( x, y ) {
    __movePlayer(x, y, _movePlayerResult);
    var x_= _movePlayerResult[0];
    var y_= _movePlayerResult[1];

    var mazeX= Math.floor(x_);
    var mazeY= Math.floor(y_);

    // Check for item collision
    var toKey= (mazeX + 1) + ':' + (mazeY + 1);
    if ( toKey in items ) {
        if ( items[toKey].type === KEY ) {
            player.items.push(items[toKey]);
            delete items[toKey];
        }
        else if ( items[toKey].type === DOOR ) {
            if ( items[toKey].opening === 0 ) {
                var haveKey;
                for ( var i= 0; i < player.items.length; i++ ) {
                    if ( player.items[i].type === KEY && player.items[i].color === items[toKey].color ) {
                        player.items.splice(i, 1);
                        items[toKey].opening= .1;  // Start door opening animation
                        haveKey= true;
                        break;
                    }
                }
                if ( !haveKey ) {
                    player.toKey= toKey;
                    return;
                }
            }
            if ( items[toKey].opening > 0 || items[toKey].closing > 0 ) {
                return;  // Wait until door is up
            }
        }
    }

// console.log("DIR", (pxDirectionPlayerX - x) * (pxDirectionPlayerX - x) + (pxDirectionPlayerY - y) * (pxDirectionPlayerY - y));

    // Only change direction if mouse was moved (prevent flip flop)
    if ( Math.abs(mouseX - playerMouseX) > 3 || Math.abs(mouseY - playerMouseY) > 3 ) {
        direction= Math.abs(x - player.x) > Math.abs(y - player.y) ? 0 : 1;
        pxDirectionPlayerX= x;
        pxDirectionPlayerY= y;
        playerMouseX= mouseX;
        playerMouseY= mouseY;
    }

    if ( toKey !== startKey && items[startKey].closing === 0 ) {
        items[startKey].closing= .1;
    }

    player.x= x_;
    player.y= y_;
    player.toKey= toKey;

    if ( player.mazeX !== mazeX || player.mazeY !== mazeY ) {
        player.movementX= mazeX - player.mazeX;
        player.movementY= mazeY - player.mazeY;
        player.mazeX= mazeX;
        player.mazeY= mazeY;
        updateMazeFloor(calcDistances(mazeX + 1, mazeY + 1));
    }
};

var movePlayer= function() {

    if ( !player.isMoving && player.fightBuddy ) {
        if ( player.fightBuddy.life > 0 ) {
///            player.fightBuddy.life--;
            if ( player.fightBuddy.life <= 0 ) {
                player.fightBuddy.life= 0;
                player.fightBuddy.fightBuddy= undefined;
                player.fightBuddy= undefined;
            }
        }
    }

    if ( player.projX === undefined
        || mousePressTimestamp === undefined
        || mousePressTimestamp < MOUSE_CLICK_DELAY
    ) {
        return;
    }

    



    var dx= mouseX - player.projX;
    var dy= mouseY - player.projY;
    var dist= dx * dx + dy * dy;

    // FIXME: Kann einmal ausgerechnet werden
    var ps= playerSpeed * pxTileSize;
    var limit= ps * ps + ps * ps;

    if ( dist < limit ) {
        if ( !player.isMoving ) return;

        var view= invProj(mouseX, mouseY);

        // mouseX/mouseY may be out of range
        if ( view === undefined ) return;

        _movePlayer(view[0], view[1]);
        return;
    }

    player.isMoving= true;

    var alpha= Math.atan2(dx, dy);
    _movePlayer(player.x + Math.sin(alpha) * playerSpeed,
                player.y + Math.cos(alpha) * playerSpeed);
};


// =============================================================================
//  Move npcs
// =============================================================================

var calcNpcTarget= function( npc, mazeX, mazeY ) {
    var mazeX_;
    var mazeY_;

    if ( npc.stepIndex >= npc.stepCount ) {
        mazeX_= mazeX;
        mazeY_= mazeY;
        var content_= maze[mazeY_ + 1][mazeX_ + 1];
        var toPlayer= 1;
        var stepCount = 1;

        npc.stepIndex= 0;
        npc.stepCount= 0;

        if ( npc.type === SKELETON && npc.fightBuddy === undefined ) {
            toPlayer= random(0, 4);
            stepCount= random(1, 7);
        }

        for ( var step= 0; step < stepCount; step++ ) {
            var dir= random(0, 4);
            for ( var i= 0; i < 4; i++, dir= (dir + 1) & 3 ) {
                var mazeX__= mazeX_ + DIRS[dir][0];
                var mazeY__= mazeY_ + DIRS[dir][1];
                var content__= maze[mazeY__ + 1][mazeX__ + 1];
                if ( content__ >= FLOOR && ((toPlayer > 0 && content__ < content_) || (toPlayer === 0 && content__ > content_)) ) {

                    var key= (mazeX__ + 1) + ':' + (mazeY__ + 1);
                    if ( key in items && items[key].type === DOOR && items[key].opening >= 0 ) continue;

                    mazeX_= mazeX__;
                    mazeY_= mazeY__;
                    content_= content__;

                    // GC-friendly solution
                    if ( npc.steps.length > npc.stepCount ) {
                        npc.steps[npc.stepCount][0]= mazeX_;
                        npc.steps[npc.stepCount][1]= mazeY_;
                    }
                    else {
                        npc.steps[npc.stepCount]= [ mazeX_, mazeY_ ];
                    }
                    npc.stepCount++;
                    break;
                }
            }
            if ( i >= 4 ) break;  // Give up
        }
    }

    if ( npc.stepIndex < npc.stepCount ) {
        mazeX_= npc.steps[npc.stepIndex][0];
        mazeY_= npc.steps[npc.stepIndex][1];
        npc.stepIndex++;

        if ( mazeX_ !== mazeX || mazeY_ !== mazeY ) {
            npc.targetX= mazeX_ + .5 + randomf(-.2, .2);
            npc.targetY= mazeY_ + .5 + randomf(-.3, .3);
            npc.atTarget= 3;
        }
    }
};

var _chooseNewTarget= function( npc ) {

    if ( npc.atTarget !== 0 ) return;

    // Letzten Schluessel geholt?
    if ( npc.type === PRINCESS && goalKey in items ) return;

    var mazeX= Math.floor(npc.x);
    var mazeY= Math.floor(npc.y);
    calcNpcTarget(npc, mazeX, mazeY);
}

var _moveNpc= function( npc, npcSpeed ) {

    npc.isMoving= false;

    if ( npc.atTarget === 0 ) return;

    var alpha= Math.atan2(npc.targetX - npc.x, npc.targetY - npc.y);

    if ( npc.atTarget & 1 ) {
        var dx= Math.sin(alpha) * npcSpeed;
        if ( Math.abs(npc.x + dx - npc.targetX) - Math.abs(dx) < EPSILON ) {
            npc.x= npc.targetX;
            npc.atTarget &= ~1;
        }
        else {
            npc.movementX= dx;
            npc.isMoving= true;
            npc.x += dx;
        }
    }
    if ( npc.atTarget & 2 ) {
        var dy= Math.cos(alpha) * npcSpeed;
        if ( Math.abs(npc.y + dy - npc.targetY) - Math.abs(dy) < EPSILON ) {
            npc.y= npc.targetY;
            npc.atTarget &= ~2;
        }
        else {
            npc.movementY= dy;
            npc.isMoving= true;
            npc.y += dy;
        }
    }
};

var moveNpc= function( npc ) {

    if ( npc.life <= 0 ) {
        npc.life -= itemSpeed;
        return;
    }

    if ( npc.fightBuddy !== undefined ) {
        npc.targetX= Math.floor(player.x);
        if ( player.x % 1 < .5 ) {
            npc.targetX += .95;
        }
        npc.targetY= player.y;
        npc.atTarget= 3;
        _moveNpc(npc, playerSpeed);
        if ( !npc.isMoving ) {

// console.log("Player:", npc.fightBuddy.life );

            npc.fightBuddy.life -= .1;
        }
        return;
    }

    _moveNpc(npc, npcSpeed);
    if ( npc.atTarget === 0 ) {
        _chooseNewTarget(npc);
        _moveNpc(npc, npcSpeed);
    }

    if ( npc.type === SKELETON
        && (player.x - npc.x) * (player.x - npc.x) + (player.y - npc.y) * (player.y - npc.y) < .5
        && player.fightBuddy === undefined
    ) {
        npc.fightBuddy= player;
        player.fightBuddy= npc;
        _chooseNewTarget(npc);
    }
}

var moveNpcs= function() {
    for ( var i= 0; i < npcs.length; i++ ) {
        moveNpc(npcs[i]);
    }
};

var moveItems= function() {
    for ( var key in items ) {
        var item= items[key];
        if ( item.type === DOOR ) {
            if ( item.opening > 0 ) {
                item.opening += itemSpeed;
                if ( item.opening >= 7 ) item.opening= -1;
            }
            if ( item.closing > 0 ) {
                item.closing += itemSpeed;
                if ( item.closing >= 7 ) {
                    item.closing= -1;
                    item.opening= 0;
                }
            }
            item.lightning += itemSpeed;
            if ( item.lightning >= 5 ) item.lightning -= 5;
        }
    }

    fightCount += itemSpeed;
};


// =============================================================================
//  Game Logic
// =============================================================================

var tick= function() {
    moveItems();
    movePlayer();
    moveNpcs();
};


// =============================================================================
//  Init
// =============================================================================

var init= function() {

    canvas= document.getElementById('stage');
    c= canvas.getContext('2d');

    window.addEventListener('resize', resizeCanvas, false);
    updateCanvas();

    // FIXME: Rename
    itemSpeed= TICKS_PER_SECOND / 80;

    playerSpeed= TICKS_PER_SECOND / 500;
    npcSpeed= TICKS_PER_SECOND / 700;
    fightCount= 0;

    player= initCharacter(PLAYER);

    genMaze();

    window.addEventListener('touchstart', onMouseDown, false);
    window.addEventListener('mousedown', onMouseDown, false);
    window.addEventListener('touchmove', onMouseMove, false);
    window.addEventListener('mousemove', onMouseMove, false);
    window.addEventListener('touchend', onMouseUp, false);
    window.addEventListener('mouseup', onMouseUp, false);

    window.requestAnimationFrame(step);
    setInterval(tick, TICKS_PER_SECOND);
};

window.addEventListener('load', function() {
    if ( DEBUG ) {
        document.getElementsByTagName('HTML')[0].className= 'debug';
    }
    loadImages(init);
});

})();
